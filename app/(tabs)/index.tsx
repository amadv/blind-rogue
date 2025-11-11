import {
  playAttackSound,
  playCaveSound,
  playDeathSound,
  playGoblinSound,
  playHearSound,
  playStepSound,
  playTickSound,
  playWindSound,
  playWinSound,
} from '@/utils/audioSystem';
import {
  checkWin,
  getAdjacentPosition,
  getDistance,
  initializeGame,
  isGoblinAdjacentToPlayer,
  isPath,
  isTrap,
  isValidPosition,
  moveGoblin,
  type GameState
} from '@/utils/gameLogic';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * Calculate direction from gesture translation
 */
function getDirection(translationX: number, translationY: number): Direction | null {
  const threshold = 10; // Minimum movement to register a direction (lowered for easier detection)
  const absX = Math.abs(translationX);
  const absY = Math.abs(translationY);

  if (absX < threshold && absY < threshold) {
    return null;
  }

  if (absX > absY) {
    return translationX > 0 ? 'right' : 'left';
  } else {
    return translationY > 0 ? 'down' : 'up';
  }
}

export default function GameScreen() {
  const [gameState, setGameState] = useState<GameState>(initializeGame());
  const [isHearing, setIsHearing] = useState(false);
  const [trapCountdown, setTrapCountdown] = useState<number | null>(null);
  const trapCountdownRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const goblinMovementIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const goblinAudioIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTapTimeRef = React.useRef<number>(0);
  const gameStateRef = React.useRef<GameState>(gameState);
  
  // Keep gameStateRef in sync with gameState
  React.useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Start goblin movement timer (moves goblins every 2 seconds)
  const startGoblinMovement = useCallback((state: GameState) => {
    if (goblinMovementIntervalRef.current) {
      clearInterval(goblinMovementIntervalRef.current);
    }
    
    goblinMovementIntervalRef.current = setInterval(() => {
      setGameState((prev) => {
        if (prev.status !== 'playing' || prev.goblins.length === 0) {
          return prev;
        }

        const updatedGoblins = prev.goblins.map((goblin) =>
          moveGoblin(goblin, prev.grid, prev.playerPosition)
        );

        return {
          ...prev,
          goblins: updatedGoblins,
        };
      });
    }, 2000); // Move every 2 seconds
  }, []);

  // Start goblin audio system (plays sounds based on distance)
  const startGoblinAudio = useCallback(() => {
    if (goblinAudioIntervalRef.current) {
      clearInterval(goblinAudioIntervalRef.current);
    }
    
    goblinAudioIntervalRef.current = setInterval(() => {
      const currentState = gameStateRef.current;
      
      if (currentState.status !== 'playing' || currentState.goblins.length === 0) {
        return;
      }

      // Check each goblin's distance and play sound if within 2 blocks
      currentState.goblins.forEach((goblin) => {
        const distance = getDistance(goblin.position, currentState.playerPosition);
        
        if (distance <= 2) {
          // Calculate volume based on distance
          // Distance 0 = volume 1.0, Distance 1 = volume 0.6, Distance 2 = volume 0.2
          let volume = 1.0;
          if (distance === 2) {
            volume = 0.2;
          } else if (distance === 1) {
            volume = 0.6;
          } else if (distance === 0) {
            volume = 1.0;
          }
          
          // Play goblin sound with calculated volume
          playGoblinSound(volume).catch(console.warn);
        }
      });
    }, 1000); // Check and play sounds every 1 second
  }, []);

  // Reset game when player dies or wins (creates new level)
  const resetGame = useCallback(() => {
    // Clear any active trap countdown
    if (trapCountdownRef.current) {
      clearTimeout(trapCountdownRef.current);
      trapCountdownRef.current = null;
    }
    // Clear goblin movement interval
    if (goblinMovementIntervalRef.current) {
      clearInterval(goblinMovementIntervalRef.current);
      goblinMovementIntervalRef.current = null;
    }
    // Clear goblin audio interval
    if (goblinAudioIntervalRef.current) {
      clearInterval(goblinAudioIntervalRef.current);
      goblinAudioIntervalRef.current = null;
    }
    setTrapCountdown(null);
    const newState = initializeGame();
    setGameState(newState);
    setIsHearing(false);
    // Start goblin movement timer
    startGoblinMovement(newState);
    // Start goblin audio system
    startGoblinAudio();
  }, [startGoblinMovement, startGoblinAudio]);

  // Restart current level (same grid, reset player to start)
  const restartCurrentLevel = useCallback(() => {
    // Clear any active trap countdown
    if (trapCountdownRef.current) {
      clearTimeout(trapCountdownRef.current);
      trapCountdownRef.current = null;
    }
    setTrapCountdown(null);
    setGameState((prev) => {
      const newState = {
        ...prev,
        playerPosition: { ...prev.startPosition },
        status: 'playing' as const,
      };
      // Restart goblin movement timer
      if (goblinMovementIntervalRef.current) {
        clearInterval(goblinMovementIntervalRef.current);
      }
      startGoblinMovement(newState);
      return newState;
    });
    setIsHearing(false);
    // Restart goblin audio system
    if (goblinAudioIntervalRef.current) {
      clearInterval(goblinAudioIntervalRef.current);
    }
    startGoblinAudio();
  }, [startGoblinMovement, startGoblinAudio]);

  // Initialize goblin movement and audio on mount
  React.useEffect(() => {
    startGoblinMovement(gameState);
    startGoblinAudio();
    return () => {
      if (goblinMovementIntervalRef.current) {
        clearInterval(goblinMovementIntervalRef.current);
      }
      if (goblinAudioIntervalRef.current) {
        clearInterval(goblinAudioIntervalRef.current);
      }
    };
  }, []); // Only run on mount

  // Handle hearing (one finger)
  const handleHear = useCallback(
    async (direction: Direction) => {
      console.log('handleHear called with direction:', direction);
      if (isHearing || gameState.status !== 'playing') {
        console.log('Hear blocked - isHearing:', isHearing, 'status:', gameState.status);
        return;
      }

      setIsHearing(true);
      try {
        // Play random hear sound first to indicate the action
        await playHearSound().catch(console.warn);
        
        const adjacentPos = getAdjacentPosition(gameState.playerPosition, direction);
        console.log('Checking adjacent position:', adjacentPos);

        // Small delay before playing the result sound
        await new Promise(resolve => setTimeout(resolve, 100));

        if (!isValidPosition(adjacentPos)) {
          // Edge of grid - play wind sound
          console.log('Edge detected - playing wind sound');
          await playWindSound().catch(console.warn);
        } else if (!isPath(gameState.grid, adjacentPos)) {
          // Wall - play wind sound
          console.log('Wall detected - playing wind sound');
          await playWindSound().catch(console.warn);
        } else {
          // Valid path - play cave sound
          console.log('Path detected - playing cave sound');
          await playCaveSound().catch(console.warn);
        }

        // Haptic feedback
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(console.warn);
      } catch (error) {
        console.error('Error in handleHear:', error);
      } finally {
        setIsHearing(false);
      }
    },
    [gameState, isHearing]
  );

  // Handle movement (two fingers)
  const handleMove = useCallback(
    async (direction: Direction) => {
      console.log('handleMove called with direction:', direction);
      if (gameState.status !== 'playing') {
        console.log('Move blocked - status:', gameState.status);
        return;
      }

      try {
        const newPos = getAdjacentPosition(gameState.playerPosition, direction);
        console.log('Attempting to move to:', newPos, 'from:', gameState.playerPosition);

        if (!isValidPosition(newPos)) {
          // Fell off edge - die and restart current level
          console.log('Fell off edge! Dying...');
          setGameState((prev) => ({ ...prev, status: 'dead' }));
          
          // Play death sound and haptic feedback
          await playDeathSound().catch(console.warn);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(console.warn);
          
          // Wait for death sound to play, then restart current level
          setTimeout(() => {
            console.log('Restarting current level...');
            restartCurrentLevel();
          }, 2000); // Increased delay to let death sound finish
          return;
        }

        if (!isPath(gameState.grid, newPos)) {
          // Hit a wall / moved in wrong direction - die and restart current level
          console.log('Hit a wall / moved in wrong direction! Dying...');
          setGameState((prev) => ({ ...prev, status: 'dead' }));
          
          // Play death sound and haptic feedback
          await playDeathSound().catch(console.warn);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(console.warn);
          
          // Wait for death sound to play, then restart current level
          setTimeout(() => {
            console.log('Restarting current level...');
            restartCurrentLevel();
          }, 2000); // Increased delay to let death sound finish
          return;
        }

        // Check if a goblin is one space away and moving towards the player
        // If the player moves when a goblin is approaching, the player dies
        const approachingGoblin = gameState.goblins.find((goblin) => {
          // Check if goblin is one space away from player
          const distance = getDistance(goblin.position, gameState.playerPosition);
          if (distance !== 1) {
            return false;
          }
          
          // Check if goblin is moving towards the player (its next position is the player's current position)
          const goblinNextPos = getAdjacentPosition(goblin.position, goblin.direction);
          return goblinNextPos.x === gameState.playerPosition.x && goblinNextPos.y === gameState.playerPosition.y;
        });

        if (approachingGoblin) {
          // Goblin is one space away and moving towards player - player dies if they move
          console.log('Goblin approaching! Player dies...');
          setGameState((prev) => ({ ...prev, status: 'dead' }));
          
          await playDeathSound().catch(console.warn);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(console.warn);
          
          setTimeout(() => {
            console.log('Restarting current level...');
            restartCurrentLevel();
          }, 2000);
          return;
        }

        // Valid move
        console.log('Valid move! Moving to:', newPos);
        await playStepSound().catch(console.warn);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(console.warn);

        // Clear any existing trap countdown
        if (trapCountdownRef.current) {
          clearTimeout(trapCountdownRef.current);
          trapCountdownRef.current = null;
        }
        setTrapCountdown(null);

        const updatedState: GameState = {
          ...gameState,
          playerPosition: newPos,
        };

        // Check if player stepped on a trap
        if (isTrap(newPos, gameState.trapPositions)) {
          console.log('Trap activated! Starting countdown...');
          setTrapCountdown(5);
          
          // Play 5 ticks over 5 seconds
          for (let i = 0; i < 5; i++) {
            setTimeout(async () => {
              await playTickSound().catch(console.warn);
              setTrapCountdown((prev) => {
                if (prev !== null && prev > 1) {
                  return prev - 1;
                }
                return prev;
              });
            }, i * 1000);
          }

          // Kill player after 5 seconds
          trapCountdownRef.current = setTimeout(() => {
            console.log('Trap triggered! Player dies...');
            setGameState((prev) => ({ ...prev, status: 'dead' }));
            setTrapCountdown(null);
            trapCountdownRef.current = null;
            
            // Play death sound and restart
            playDeathSound()
              .catch(console.warn)
              .then(() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(console.warn);
                setTimeout(() => {
                  restartCurrentLevel();
                }, 2000);
              });
          }, 5000);
        }

        // Check win condition
        if (checkWin(newPos, gameState.endPosition)) {
          console.log('Win condition met!');
          // Clear trap countdown if active
          if (trapCountdownRef.current) {
            clearTimeout(trapCountdownRef.current);
            trapCountdownRef.current = null;
          }
          setTrapCountdown(null);
          updatedState.status = 'won';
          await playWinSound().catch(console.warn);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(console.warn);
        }

        setGameState(updatedState);
      } catch (error) {
        console.error('Error in handleMove:', error);
      }
    },
    [gameState, resetGame, restartCurrentLevel]
  );

  // Track number of pointers during gesture
  const [pointerCount, setPointerCount] = useState(0);

  // Wrapper functions to call from gesture handler
  // We need to capture pointerCount in a ref to access the latest value
  const pointerCountRef = React.useRef(0);
  
  React.useEffect(() => {
    pointerCountRef.current = pointerCount;
  }, [pointerCount]);

  const handleGestureEnd = useCallback(
    (translationX: number, translationY: number) => {
      const currentPointerCount = pointerCountRef.current;
      console.log('handleGestureEnd called', { 
        translationX, 
        translationY, 
        trackedPointers: currentPointerCount 
      });
      try {
        const direction = getDirection(translationX, translationY);
        console.log('Detected direction:', direction);

        if (!direction) {
          console.log('No direction detected (movement too small)');
          return;
        }

        // Use the tracked pointer count from ref (most reliable)
        const count = currentPointerCount || 1;
        console.log('Pointer count:', count);

        if (count === 1) {
          // One finger: hear
          console.log('Triggering hear for direction:', direction);
          handleHear(direction).catch((err) => {
            console.warn('Error in handleHear:', err);
          });
        } else if (count >= 2) {
          // Two or more fingers: move
          console.log('Triggering move for direction:', direction);
          handleMove(direction).catch((err) => {
            console.warn('Error in handleMove:', err);
          });
        } else {
          console.log('Unknown pointer count:', count);
        }
      } catch (error) {
        console.error('Error in handleGestureEnd:', error);
      }
    },
    [handleHear, handleMove]
  );

  const handleGestureStart = useCallback((numPointers: number) => {
    console.log('Gesture started, pointers:', numPointers);
    pointerCountRef.current = numPointers;
    setPointerCount(numPointers);
  }, []);

  // Handle double tap for backstab
  const handleDoubleTap = useCallback(() => {
    if (gameState.status !== 'playing') {
      return;
    }

    const now = Date.now();
    const timeSinceLastTap = now - lastTapTimeRef.current;
    
    // Check if this is a double tap (within 300ms, but not the first tap)
    if (timeSinceLastTap > 0 && timeSinceLastTap < 300) {
      // Find goblin adjacent to player
      const adjacentGoblin = gameState.goblins.find((goblin) =>
        isGoblinAdjacentToPlayer(goblin, gameState.playerPosition)
      );

      if (adjacentGoblin) {
        console.log('Backstab! Killing goblin:', adjacentGoblin.id);
        // Remove the goblin
        setGameState((prev) => ({
          ...prev,
          goblins: prev.goblins.filter((g) => g.id !== adjacentGoblin.id),
        }));
        // Play attack sound
        playAttackSound().catch(console.warn);
        // Play haptic feedback
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(console.warn);
        // Reset tap time to prevent triple tap from triggering
        lastTapTimeRef.current = 0;
        return;
      }
    }
    
    // Update last tap time
    lastTapTimeRef.current = now;
  }, [gameState]);

  // Tap gesture for double tap (backstab)
  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(1)
        .onEnd(() => {
          runOnJS(handleDoubleTap)();
        }),
    [handleDoubleTap]
  );

  // Combined gesture handler that detects number of fingers
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(5)
        .onStart((event) => {
          console.log('[Worklet] Gesture started, pointers:', event.numberOfPointers);
          runOnJS(handleGestureStart)(event.numberOfPointers);
        })
        .onUpdate((event) => {
          runOnJS(setPointerCount)(event.numberOfPointers);
        })
        .onEnd((event) => {
          console.log('[Worklet] Gesture onEnd', {
            translationX: event.translationX,
            translationY: event.translationY,
            pointers: event.numberOfPointers,
          });
          // Don't pass pointer count from event (it might be 0), use the ref instead
          runOnJS(handleGestureEnd)(
            event.translationX,
            event.translationY
          );
        }),
    [handleGestureStart, handleGestureEnd]
  );

  // Combine gestures
  const combinedGesture = useMemo(
    () => Gesture.Race(panGesture, tapGesture),
    [panGesture, tapGesture]
  );

  // Status message for debugging (optional - can be removed for true blind experience)
  const getStatusMessage = () => {
    if (gameState.status === 'dead') {
      return 'You fell off the edge! Restarting level...';
    }
    if (gameState.status === 'won') {
      return 'You reached the end! Tap to play again.';
    }
    return `Position: (${gameState.playerPosition.x}, ${gameState.playerPosition.y})`;
  };

  // Render grid cell
  const renderCell = (x: number, y: number) => {
    const isPath = gameState.grid[y][x] === 1;
    const isPlayer = gameState.playerPosition.x === x && gameState.playerPosition.y === y;
    const isStart = gameState.startPosition.x === x && gameState.startPosition.y === y;
    const isEnd = gameState.endPosition.x === x && gameState.endPosition.y === y;
    const hasTrap = isTrap({ x, y }, gameState.trapPositions);
    const hasGoblin = gameState.goblins.some((goblin) => goblin.position.x === x && goblin.position.y === y);

    let cellColor = '#1a1a1a'; // Dark gray for walls
    if (isPath) {
      cellColor = '#ffffff'; // White for paths
    }
    if (hasTrap && !isPlayer && !hasGoblin) {
      cellColor = '#800080'; // Purple for traps
    }
    if (hasGoblin && !isPlayer) {
      cellColor = '#006400'; // Dark green for goblins
    }
    if (isPlayer) {
      cellColor = '#00ff00'; // Green for player
    }
    if (isStart && !isPlayer && !hasTrap && !hasGoblin) {
      cellColor = '#0000ff'; // Blue for start
    }
    if (isEnd && !isPlayer && !hasTrap && !hasGoblin) {
      cellColor = '#ff0000'; // Red for end
    }

    return (
      <View
        key={`${x}-${y}`}
        style={[
          styles.cell,
          {
            backgroundColor: cellColor,
            borderColor: '#333333',
            borderWidth: 1,
          },
        ]}
      />
    );
  };

  return (
    <View style={styles.container}>
      <GestureDetector gesture={combinedGesture}>
        <View style={styles.gameArea}>
          {/* Visual Grid */}
          <View style={styles.gridContainer}>
            {gameState.grid.map((row, y) => (
              <View key={y} style={styles.gridRow}>
                {row.map((_, x) => renderCell(x, y))}
              </View>
            ))}
          </View>

          {/* Instructions overlay */}
          <View style={styles.instructions}>
            <Text style={styles.instructionText}>
              One finger slide: Hear direction{'\n'}
              Two finger slide: Move direction
            </Text>
            <Text style={styles.statusText}>{getStatusMessage()}</Text>
          </View>

          {/* Restart button (accessible) */}
          {gameState.status === 'won' && (
            <Pressable style={styles.restartButton} onPress={resetGame}>
              <Text style={styles.restartButtonText}>Play Again</Text>
            </Pressable>
          )}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  gameArea: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContainer: {
    flexDirection: 'column',
    borderWidth: 2,
    borderColor: '#444444',
    backgroundColor: '#0a0a0a',
  },
  gridRow: {
    flexDirection: 'row',
  },
  cell: {
    width: 30,
    height: 30,
  },
  instructions: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 10,
    borderRadius: 8,
  },
  instructionText: {
    color: '#ffffff',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
  statusText: {
    color: '#cccccc',
    fontSize: 12,
    textAlign: 'center',
  },
  restartButton: {
    marginTop: 100,
    paddingHorizontal: 30,
    paddingVertical: 15,
    backgroundColor: '#333333',
    borderRadius: 8,
  },
  restartButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
