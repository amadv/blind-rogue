import {
  playAttackSound,
  playCaveSound,
  playDeathSound,
  playHearSound,
  playStartSound,
  playStepSound,
  playTickSound,
  playTrapSound,
  playWindSound,
  playWinSound,
  startGoblinSound,
  stopAllGoblinSounds,
  stopGoblinSound,
  stopTrapSound
} from '@/utils/audioSystem';
import {
  checkWin,
  getAdjacentPosition,
  getDistance,
  initializeGame,
  isGoblinApproachingPlayer,
  isGoblinWalkingAway,
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
  const activeGoblinIdsRef = React.useRef<Set<number>>(new Set());
  
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

  // Start goblin audio system (continuously updates volumes based on distance)
  const startGoblinAudio = useCallback(() => {
    if (goblinAudioIntervalRef.current) {
      clearInterval(goblinAudioIntervalRef.current);
    }
    
    // Clear active goblin IDs when restarting
    activeGoblinIdsRef.current.clear();
    
    goblinAudioIntervalRef.current = setInterval(() => {
      const currentState = gameStateRef.current;
      const activeGoblinIds = activeGoblinIdsRef.current;
      
      if (currentState.status !== 'playing') {
        // Stop all goblin sounds if game is not playing
        stopAllGoblinSounds().catch(console.warn);
        activeGoblinIds.clear();
        return;
      }

      // Update active goblin IDs
      const currentGoblinIds = new Set(currentState.goblins.map(g => g.id));
      
      // Stop sounds for goblins that no longer exist
      activeGoblinIds.forEach((id) => {
        if (!currentGoblinIds.has(id)) {
          stopGoblinSound(id).catch(console.warn);
          activeGoblinIds.delete(id);
        }
      });

      // Update sounds for each goblin based on PROXIMITY (distance only, not direction)
      // Sound plays continuously as long as goblin is within range, regardless of movement direction
      currentState.goblins.forEach((goblin) => {
        activeGoblinIds.add(goblin.id);
        const distance = getDistance(goblin.position, currentState.playerPosition);
        
        // Smooth volume calculation based on distance (proximity-based, not direction-based)
        // Max audible distance: 3 blocks
        // Volume fades smoothly: distance 0 = 1.0, distance 3 = 0.0
        const maxDistance = 3;
        let volume = 0;
        
        if (distance <= maxDistance) {
          // Smooth fade: volume decreases linearly with distance
          // At distance 0: volume = 1.0
          // At distance 1: volume = 0.67
          // At distance 2: volume = 0.33
          // At distance 3: volume = 0.0
          volume = Math.max(0, 1 - (distance / maxDistance));
          
          // Start or update the goblin sound with calculated volume
          // This ensures sound plays continuously based on proximity, regardless of goblin's movement direction
          startGoblinSound(goblin.id, volume).catch(console.warn);
        } else {
          // Goblin is too far away, stop its sound
          stopGoblinSound(goblin.id).catch(console.warn);
          activeGoblinIds.delete(goblin.id);
        }
      });
    }, 100); // Update every 100ms for smooth fading
  }, []);

  // Reset game when player dies or wins (creates new level)
  const resetGame = useCallback(() => {
    // Clear any active trap countdown
    if (trapCountdownRef.current) {
      clearTimeout(trapCountdownRef.current);
      trapCountdownRef.current = null;
    }
    // Stop trap sound if playing
    stopTrapSound().catch(console.warn);
    // Stop all goblin sounds
    stopAllGoblinSounds().catch(console.warn);
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
    // Play start sound when starting a new level
    playStartSound().catch(console.warn);
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
    // Stop trap sound if playing
    stopTrapSound().catch(console.warn);
    // Stop all goblin sounds
    stopAllGoblinSounds().catch(console.warn);
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
    // Play start sound when first loading the game
    playStartSound().catch(console.warn);
    startGoblinMovement(gameState);
    startGoblinAudio();
    return () => {
      if (goblinMovementIntervalRef.current) {
        clearInterval(goblinMovementIntervalRef.current);
      }
      if (goblinAudioIntervalRef.current) {
        clearInterval(goblinAudioIntervalRef.current);
      }
      // Clean up all goblin sounds on unmount
      stopAllGoblinSounds().catch(console.warn);
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

        // Check if a goblin is one space away OR on the same tile and moving towards the player
        // If the player moves when a goblin is approaching, the player dies
        const approachingGoblin = gameState.goblins.find((goblin) => {
          const distance = getDistance(goblin.position, gameState.playerPosition);
          // Check if goblin is one space away OR on the same tile (distance 0 or 1)
          if (distance !== 0 && distance !== 1) {
            return false;
          }
          
          // Check if goblin is moving towards the player (its next position is the player's current position)
          return isGoblinApproachingPlayer(goblin, gameState.playerPosition);
        });

        if (approachingGoblin) {
          // Goblin is approaching (one space away or same tile) and moving towards player - player dies if they move
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

        // Check if player was on a trap and is now moving off it
        const wasOnTrap = isTrap(gameState.playerPosition, gameState.trapPositions);
        const isOnTrap = isTrap(newPos, gameState.trapPositions);
        
        // Stop trap sound if moving off trap (check both position and countdown state)
        if ((wasOnTrap || trapCountdown !== null) && !isOnTrap) {
          console.log('Moving off trap, stopping trap sound...');
          await stopTrapSound().catch(console.warn);
        }

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
        if (isOnTrap) {
          console.log('Trap activated! Starting countdown...');
          
          // Play trap sound (looping)
          await playTrapSound().catch(console.warn);
          
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
            
            // Stop trap sound
            stopTrapSound().catch(console.warn);
            
            // Play attack sound (indicating death from trap) and restart
            playAttackSound()
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
          // Stop trap sound if playing
          await stopTrapSound().catch(console.warn);
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
      // First check: If goblin is approaching (one space away OR same tile) and moving towards player
      // Attempting to attack an approaching goblin kills the player
      const approachingGoblin = gameState.goblins.find((goblin) => {
        const distance = getDistance(goblin.position, gameState.playerPosition);
        // Check if goblin is one space away OR on the same tile (distance 0 or 1)
        if (distance !== 0 && distance !== 1) {
          return false;
        }
        // Check if goblin is moving towards the player
        return isGoblinApproachingPlayer(goblin, gameState.playerPosition);
      });

      if (approachingGoblin) {
        // Player tried to attack an approaching goblin - player dies
        console.log('Attacked approaching goblin! Player dies...');
        setGameState((prev) => ({ ...prev, status: 'dead' }));
        
        playDeathSound().catch(console.warn);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(console.warn);
        
        setTimeout(() => {
          console.log('Restarting current level...');
          restartCurrentLevel();
        }, 2000);
        lastTapTimeRef.current = 0;
        return;
      }

      // Second check: If goblin is one space away and walking AWAY from player
      // This is the only safe time to backstab
      const goblinWalkingAway = gameState.goblins.find((goblin) => {
        const distance = getDistance(goblin.position, gameState.playerPosition);
        if (distance !== 1) {
          return false;
        }
        // Check if goblin is walking away from the player
        return isGoblinWalkingAway(goblin, gameState.playerPosition);
      });

      if (goblinWalkingAway) {
        console.log('Backstab! Killing goblin:', goblinWalkingAway.id);
        // Stop the goblin's sound before removing it
        stopGoblinSound(goblinWalkingAway.id).catch(console.warn);
        // Remove the goblin
        setGameState((prev) => ({
          ...prev,
          goblins: prev.goblins.filter((g) => g.id !== goblinWalkingAway.id),
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
  }, [gameState, restartCurrentLevel]);

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

  // Game log messages with dungeon vibes
  const getGameLog = () => {
    const messages: string[] = [];
    
    if (gameState.status === 'dead') {
      messages.push('> YOU DIED');
      messages.push('> RESTARTING...');
    } else if (gameState.status === 'won') {
      messages.push('> EXIT REACHED');
      messages.push('> LEVEL CLEARED');
    } else {
      messages.push(`> POS [${gameState.playerPosition.x},${gameState.playerPosition.y}]`);
      if (trapCountdown !== null) {
        messages.push(`> TRAP: ${trapCountdown}s`);
      }
      if (gameState.goblins.length > 0) {
        messages.push(`> GOBLINS: ${gameState.goblins.length}`);
      }
    }
    
    return messages;
  };

  // Render grid cell as circle (weiqi board style)
  const renderCell = (x: number, y: number) => {
    const isPath = gameState.grid[y][x] === 1;
    const isPlayer = gameState.playerPosition.x === x && gameState.playerPosition.y === y;
    const isStart = gameState.startPosition.x === x && gameState.startPosition.y === y;
    const isEnd = gameState.endPosition.x === x && gameState.endPosition.y === y;
    const hasTrap = isTrap({ x, y }, gameState.trapPositions);
    const hasGoblin = gameState.goblins.some((goblin) => goblin.position.x === x && goblin.position.y === y);

    // Mono black and white theme with shades of gray
    let circleColor = '#000000'; // Black for walls (no circle shown)
    let circleSize = 0; // No circle for walls
    
    if (isPath) {
      circleColor = '#cccccc'; // Light gray for paths
      circleSize = 10; // Base size for path circles
    }
    
    // Player is a large white circle (most visible)
    if (isPlayer) {
      circleColor = '#00ff00';
      circleSize = 16;
    }
    
    // Start position - white circle with border
    if (isStart && !isPlayer && !hasTrap && !hasGoblin) {
      circleColor = '#ffffff';
      circleSize = 12;
    }
    
    // End position - large white circle
    if (isEnd && !isPlayer && !hasTrap && !hasGoblin) {
      circleColor = '#ffffff';
      circleSize = 18;
    }
    
    // Trap - dark gray circle
    if (hasTrap && !isPlayer && !hasGoblin) {
      circleColor = '#666666';
      circleSize = 8;
    }
    
    // Goblin - medium gray circle
    if (hasGoblin && !isPlayer) {
      circleColor = '#ff0000';
      circleSize = 10;
    }

    return (
      <View
        key={`${x}-${y}`}
        style={styles.cell}
      >
        {circleSize > 0 && (
          <View
            style={[
              styles.circle,
              {
                width: circleSize,
                height: circleSize,
                borderRadius: circleSize / 2,
                backgroundColor: circleColor,
                borderWidth: isStart && !isPlayer && !hasTrap && !hasGoblin ? 2 : 0,
                borderColor: '#000000',
              },
            ]}
          />
        )}
      </View>
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

          {/* Game Log */}
          <View style={styles.gameLog}>
            {getGameLog().map((msg, idx) => (
              <Text key={idx} style={styles.logText}>{msg}</Text>
            ))}
          </View>

          {/* Instructions overlay */}
          <View style={styles.instructions}>
            <Text style={styles.instructionText}>
              [1 FINGER] HEAR  [2 FINGERS] MOVE
            </Text>
            <Text style={styles.instructionText}>
              [DOUBLE TAP] BACKSTAB
            </Text>
          </View>

          {/* Restart button (accessible) */}
          {gameState.status === 'won' && (
            <Pressable style={styles.restartButton} onPress={resetGame}>
              <Text style={styles.restartButtonText}>[ CONTINUE ]</Text>
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
    backgroundColor: '#000000',
    padding: 12,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  gridRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#666666',
  },
  cell: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#666666',
  },
  circle: {
    position: 'absolute',
  },
  gameLog: {
    position: 'absolute',
    top: 40,
    left: 20,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#ffffff',
    padding: 12,
    minWidth: 200,
  },
  logText: {
    color: '#ffffff',
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 16,
    letterSpacing: 0.5,
  },
  instructions: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    alignItems: 'center',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#ffffff',
    padding: 12,
  },
  instructionText: {
    color: '#ffffff',
    fontSize: 11,
    fontFamily: 'monospace',
    letterSpacing: 1,
    textAlign: 'center',
  },
  restartButton: {
    marginTop: 100,
    paddingHorizontal: 30,
    paddingVertical: 15,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  restartButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
});
