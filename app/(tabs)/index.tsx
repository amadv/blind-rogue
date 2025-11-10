import {
  playCaveSound,
  playDeathSound,
  playHearSound,
  playStepSound,
  playWindSound,
  playWinSound,
} from '@/utils/audioSystem';
import {
  checkWin,
  getAdjacentPosition,
  initializeGame,
  isPath,
  isValidPosition,
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

  // Reset game when player dies or wins
  const resetGame = useCallback(() => {
    setGameState(initializeGame());
    setIsHearing(false);
  }, []);

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
          // Fell off edge - die and restart
          console.log('Fell off edge!');
          await playDeathSound().catch(console.warn);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(console.warn);
          setGameState((prev) => ({ ...prev, status: 'dead' }));
          setTimeout(() => {
            resetGame();
          }, 1500);
          return;
        }

        if (!isPath(gameState.grid, newPos)) {
          // Hit a wall - can't move
          console.log('Hit a wall!');
          await playWindSound().catch(console.warn);
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(console.warn);
          return;
        }

        // Valid move
        console.log('Valid move! Moving to:', newPos);
        await playStepSound().catch(console.warn);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(console.warn);

        const updatedState: GameState = {
          ...gameState,
          playerPosition: newPos,
        };

        // Check win condition
        if (checkWin(newPos, gameState.endPosition)) {
          console.log('Win condition met!');
          updatedState.status = 'won';
          await playWinSound().catch(console.warn);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(console.warn);
        }

        setGameState(updatedState);
      } catch (error) {
        console.error('Error in handleMove:', error);
      }
    },
    [gameState, resetGame]
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

  // Status message for debugging (optional - can be removed for true blind experience)
  const getStatusMessage = () => {
    if (gameState.status === 'dead') {
      return 'You fell off the edge! Restarting...';
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

    let cellColor = '#1a1a1a'; // Dark gray for walls
    if (isPath) {
      cellColor = '#ffffff'; // White for paths
    }
    if (isPlayer) {
      cellColor = '#00ff00'; // Green for player
    }
    if (isStart && !isPlayer) {
      cellColor = '#0000ff'; // Blue for start
    }
    if (isEnd && !isPlayer) {
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
      <GestureDetector gesture={panGesture}>
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
