export type Grid = number[][];
export type Position = { x: number; y: number };

export interface GameState {
  grid: Grid;
  playerPosition: Position;
  startPosition: Position;
  endPosition: Position;
  status: 'playing' | 'dead' | 'won';
}

const GRID_SIZE = 10;

/**
 * Generates a 10x10 grid with a guaranteed path from (0,0) to (9,9)
 * Returns a grid where 0 = wall and 1 = path
 */
export function generateGrid(): Grid {
  // Initialize grid with all walls (0)
  const grid: Grid = Array(GRID_SIZE)
    .fill(null)
    .map(() => Array(GRID_SIZE).fill(0));

  // Start at (0,0) and end at (9,9)
  const start: Position = { x: 0, y: 0 };
  const end: Position = { x: GRID_SIZE - 1, y: GRID_SIZE - 1 };

  // Mark start and end as path
  grid[start.y][start.x] = 1;
  grid[end.y][end.x] = 1;

  // Create a guaranteed path using a simple algorithm
  // We'll randomly choose between right and down moves, ensuring we reach the end
  let current: Position = { ...start };
  const path: Position[] = [{ ...start }];

  while (current.x !== end.x || current.y !== end.y) {
    const canMoveRight = current.x < end.x;
    const canMoveDown = current.y < end.y;

    if (canMoveRight && canMoveDown) {
      // Randomly choose right or down
      if (Math.random() < 0.5) {
        current.x += 1;
      } else {
        current.y += 1;
      }
    } else if (canMoveRight) {
      current.x += 1;
    } else if (canMoveDown) {
      current.y += 1;
    }

    grid[current.y][current.x] = 1;
    path.push({ ...current });
  }

  // Add some additional random paths to make it more interesting
  // Add a few random connections without breaking the main path
  for (let i = 0; i < 15; i++) {
    const x = Math.floor(Math.random() * GRID_SIZE);
    const y = Math.floor(Math.random() * GRID_SIZE);
    
    // Only add if it's adjacent to an existing path
    const hasAdjacentPath =
      (x > 0 && grid[y][x - 1] === 1) ||
      (x < GRID_SIZE - 1 && grid[y][x + 1] === 1) ||
      (y > 0 && grid[y - 1][x] === 1) ||
      (y < GRID_SIZE - 1 && grid[y + 1][x] === 1);

    if (hasAdjacentPath && Math.random() < 0.3) {
      grid[y][x] = 1;
    }
  }

  return grid;
}

/**
 * Check if a position is valid (within grid bounds)
 */
export function isValidPosition(pos: Position): boolean {
  return (
    pos.x >= 0 &&
    pos.x < GRID_SIZE &&
    pos.y >= 0 &&
    pos.y < GRID_SIZE
  );
}

/**
 * Check if a position is a valid path (not a wall)
 */
export function isPath(grid: Grid, pos: Position): boolean {
  if (!isValidPosition(pos)) {
    return false;
  }
  return grid[pos.y][pos.x] === 1;
}

/**
 * Get the adjacent position in a given direction
 */
export function getAdjacentPosition(
  current: Position,
  direction: 'up' | 'down' | 'left' | 'right'
): Position {
  switch (direction) {
    case 'up':
      return { x: current.x, y: current.y - 1 };
    case 'down':
      return { x: current.x, y: current.y + 1 };
    case 'left':
      return { x: current.x - 1, y: current.y };
    case 'right':
      return { x: current.x + 1, y: current.y };
  }
}

/**
 * Initialize a new game state
 */
export function initializeGame(): GameState {
  const grid = generateGrid();
  const startPosition: Position = { x: 0, y: 0 };
  const endPosition: Position = { x: GRID_SIZE - 1, y: GRID_SIZE - 1 };

  return {
    grid,
    playerPosition: { ...startPosition },
    startPosition,
    endPosition,
    status: 'playing',
  };
}

/**
 * Check if player has won (reached the end)
 */
export function checkWin(playerPos: Position, endPos: Position): boolean {
  return playerPos.x === endPos.x && playerPos.y === endPos.y;
}

