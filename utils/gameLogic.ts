export type Grid = number[][];
export type Position = { x: number; y: number };
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Goblin {
  id: number;
  position: Position;
  direction: Direction;
}

export interface GameState {
  grid: Grid;
  playerPosition: Position;
  startPosition: Position;
  endPosition: Position;
  trapPositions: Position[];
  goblins: Goblin[];
  status: 'playing' | 'dead' | 'won';
}

const GRID_SIZE = 10;

/**
 * Generates a 10x10 grid with a guaranteed path from random start to random end
 * Returns a grid where 0 = wall and 1 = path
 * Creates a single winding path with occasional 2x2 rooms, like classic Rogue
 */
export function generateGrid(): { grid: Grid; start: Position; end: Position } {
  // Initialize grid with all walls (0)
  const grid: Grid = Array(GRID_SIZE)
    .fill(null)
    .map(() => Array(GRID_SIZE).fill(0));

  // Generate random start and end positions
  // Ensure they're not the same and have some distance between them
  let start: Position;
  let end: Position;
  do {
    start = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
    end = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
    // Ensure minimum distance of at least 5 cells
  } while (
    (start.x === end.x && start.y === end.y) ||
    Math.abs(start.x - end.x) + Math.abs(start.y - end.y) < 5
  );

  // Mark start and end as path
  grid[start.y][start.x] = 1;
  grid[end.y][end.x] = 1;

  // Create a single winding path with lots of twists and turns
  let current: Position = { ...start };
  const path: Position[] = [{ ...start }];
  let lastDirection: 'right' | 'down' | 'left' | 'up' | null = null;
  let straightCount = 0; // Track how many straight moves to encourage turns
  let roomCount = 0; // Track how many rooms we've created
  const maxRooms = 3; // Maximum number of 2x2 rooms

  while (current.x !== end.x || current.y !== end.y) {
    const dx = end.x - current.x;
    const dy = end.y - current.y;
    const possibleMoves: Array<{ pos: Position; dir: 'right' | 'down' | 'left' | 'up' }> = [];

    // Check all 4 directions
    possibleMoves.push({ pos: { x: current.x + 1, y: current.y }, dir: 'right' });
    possibleMoves.push({ pos: { x: current.x, y: current.y + 1 }, dir: 'down' });
    possibleMoves.push({ pos: { x: current.x - 1, y: current.y }, dir: 'left' });
    possibleMoves.push({ pos: { x: current.x, y: current.y - 1 }, dir: 'up' });

    // Filter to valid positions (within bounds and not already a path)
    // Also check that we don't create adjacent paths that would form rooms
    const validMoves = possibleMoves.filter((move) => {
      if (
        move.pos.x < 0 ||
        move.pos.x >= GRID_SIZE ||
        move.pos.y < 0 ||
        move.pos.y >= GRID_SIZE
      ) {
        return false;
      }
      
      // Don't go to a cell that's already a path
      if (grid[move.pos.y][move.pos.x] === 1) {
        return false;
      }
      
      // Check adjacent cells to avoid creating large open areas
      // Count how many adjacent cells are already paths
      let adjacentPathCount = 0;
      const checkPos = move.pos;
      
      if (checkPos.x > 0 && grid[checkPos.y][checkPos.x - 1] === 1) adjacentPathCount++;
      if (checkPos.x < GRID_SIZE - 1 && grid[checkPos.y][checkPos.x + 1] === 1) adjacentPathCount++;
      if (checkPos.y > 0 && grid[checkPos.y - 1][checkPos.x] === 1) adjacentPathCount++;
      if (checkPos.y < GRID_SIZE - 1 && grid[checkPos.y + 1][checkPos.x] === 1) adjacentPathCount++;
      
      // Only allow if it's adjacent to exactly 1 path cell (the current position)
      // This ensures we maintain a single path
      return adjacentPathCount === 1;
    });

    if (validMoves.length === 0) {
      // No valid moves, create direct path to end
      break;
    }

    // Strongly encourage turns: if we've gone straight for 1+ moves, prefer changing direction
    let chosenMove;
    if (straightCount >= 1 && lastDirection && validMoves.length > 1) {
      // Prefer a different direction (more twisty)
      const turnMoves = validMoves.filter((m) => m.dir !== lastDirection);
      if (turnMoves.length > 0) {
        // Among turn moves, prefer ones that get us closer to end, but add randomness
        turnMoves.sort((a, b) => {
          const distA = Math.abs(a.pos.x - end.x) + Math.abs(a.pos.y - end.y);
          const distB = Math.abs(b.pos.x - end.x) + Math.abs(b.pos.y - end.y);
          return distA - distB;
        });
        // 60% chance to take best turn, 40% to take random turn (more twisty)
        chosenMove = Math.random() < 0.6 ? turnMoves[0] : turnMoves[Math.floor(Math.random() * turnMoves.length)];
        straightCount = 0;
      } else {
        chosenMove = validMoves[Math.floor(Math.random() * validMoves.length)];
        if (chosenMove.dir === lastDirection) {
          straightCount++;
        } else {
          straightCount = 0;
        }
      }
    } else {
      // Randomly choose with more emphasis on turns and less on direct path
      // Only 40% chance to prefer moves toward the end, 60% random (more twisty)
      if (Math.random() < 0.4 && validMoves.length > 0) {
        // Prefer moves that reduce distance to end
        validMoves.sort((a, b) => {
          const distA = Math.abs(a.pos.x - end.x) + Math.abs(a.pos.y - end.y);
          const distB = Math.abs(b.pos.x - end.x) + Math.abs(b.pos.y - end.y);
          return distA - distB;
        });
        chosenMove = validMoves[0];
      } else {
        // Random move for more twists
        chosenMove = validMoves[Math.floor(Math.random() * validMoves.length)];
      }
      
      if (chosenMove.dir === lastDirection) {
        straightCount++;
      } else {
        straightCount = 0;
      }
    }

    current = chosenMove.pos;
    lastDirection = chosenMove.dir;
    grid[current.y][current.x] = 1;
    path.push({ ...current });

    // Occasionally create a 2x2 room (4 squares) along the path
    // Only create rooms if we have space, haven't created too many, and it's not too close to start/end
    const distanceToEnd = Math.abs(current.x - end.x) + Math.abs(current.y - end.y);
    if (
      roomCount < maxRooms &&
      Math.random() < 0.12 && // 12% chance per step
      path.length > 5 &&
      distanceToEnd > 5 && // Not too close to end
      current.x > 1 &&
      current.x < GRID_SIZE - 3 &&
      current.y > 1 &&
      current.y < GRID_SIZE - 3
    ) {
      // Create a 2x2 room - check if all 4 squares are walls (except current which is path)
      const roomX = current.x;
      const roomY = current.y;
      
      // Check if we can place a room (3 adjacent squares should be walls)
      const canPlaceRoom =
        (grid[roomY][roomX + 1] === 0) &&
        (grid[roomY + 1][roomX] === 0) &&
        (grid[roomY + 1][roomX + 1] === 0) &&
        roomX + 1 < GRID_SIZE &&
        roomY + 1 < GRID_SIZE;

      if (canPlaceRoom) {
        // Create the 2x2 room
        grid[roomY][roomX] = 1; // Already a path
        grid[roomY][roomX + 1] = 1;
        grid[roomY + 1][roomX] = 1;
        grid[roomY + 1][roomX + 1] = 1;
        roomCount++;
      }
    }
  }

  // Ensure we reach the end - create direct path if needed
  if (current.x !== end.x || current.y !== end.y) {
    while (current.x !== end.x || current.y !== end.y) {
      if (current.x < end.x) {
        current.x += 1;
      } else if (current.x > end.x) {
        current.x -= 1;
      } else if (current.y < end.y) {
        current.y += 1;
      } else if (current.y > end.y) {
        current.y -= 1;
      }
      grid[current.y][current.x] = 1;
    }
  }

  return { grid, start, end };
}

/**
 * Generate random trap positions on path tiles
 * Traps are placed on path tiles, but not on start or end positions
 */
export function generateTraps(
  grid: Grid,
  start: Position,
  end: Position,
  numTraps: number = 2
): Position[] {
  const traps: Position[] = [];
  const pathPositions: Position[] = [];

  // Collect all path positions (excluding start and end)
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid[y][x] === 1) {
        // It's a path tile
        const pos = { x, y };
        // Don't place traps on start or end
        if (
          !(pos.x === start.x && pos.y === start.y) &&
          !(pos.x === end.x && pos.y === end.y)
        ) {
          pathPositions.push(pos);
        }
      }
    }
  }

  // Randomly select trap positions
  const numTrapsToPlace = Math.min(numTraps, pathPositions.length);
  const shuffled = [...pathPositions].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < numTrapsToPlace; i++) {
    traps.push(shuffled[i]);
  }

  return traps;
}

/**
 * Check if a position has a trap
 */
export function isTrap(pos: Position, trapPositions: Position[]): boolean {
  return trapPositions.some(
    (trap) => trap.x === pos.x && trap.y === pos.y
  );
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
 * Generate random goblin positions on path tiles
 * Returns 0, 1, or 2 goblins
 */
export function generateGoblins(
  grid: Grid,
  start: Position,
  end: Position,
  playerPos: Position
): Goblin[] {
  const goblins: Goblin[] = [];
  const pathPositions: Position[] = [];
  let nextGoblinId = 1;

  // Collect all path positions (excluding start, end, and player position)
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid[y][x] === 1) {
        const pos = { x, y };
        if (
          !(pos.x === start.x && pos.y === start.y) &&
          !(pos.x === end.x && pos.y === end.y) &&
          !(pos.x === playerPos.x && pos.y === playerPos.y)
        ) {
          pathPositions.push(pos);
        }
      }
    }
  }

  // Randomly decide how many goblins (0, 1, or 2)
  const numGoblins = Math.floor(Math.random() * 3);
  const shuffled = [...pathPositions].sort(() => Math.random() - 0.5);
  const directions: Direction[] = ['up', 'down', 'left', 'right'];

  for (let i = 0; i < numGoblins && i < shuffled.length; i++) {
    const randomDirection = directions[Math.floor(Math.random() * directions.length)];
    goblins.push({
      id: nextGoblinId++,
      position: shuffled[i],
      direction: randomDirection,
    });
  }

  return goblins;
}

/**
 * Move a goblin one step in its current direction
 * If blocked, pick a new random direction
 * Goblins can walk through the player position (they don't stop on it)
 */
export function moveGoblin(
  goblin: Goblin,
  grid: Grid,
  playerPos: Position
): Goblin {
  const nextPos = getAdjacentPosition(goblin.position, goblin.direction);
  
  // Check if goblin can continue in current direction
  // Allow goblin to move through player position (isPath check only)
  if (isPath(grid, nextPos)) {
    // Can move forward (even if player is there, goblin walks through)
    return {
      ...goblin,
      position: nextPos,
    };
  }

  // Blocked - pick a new random direction
  const directions: Direction[] = ['up', 'down', 'left', 'right'];
  const validDirections = directions.filter((dir) => {
    const testPos = getAdjacentPosition(goblin.position, dir);
    return isPath(grid, testPos);
    // Note: Goblins can walk through player, so we don't check for player position
  });

  if (validDirections.length === 0) {
    // No valid moves, stay in place
    return goblin;
  }

  const newDirection = validDirections[Math.floor(Math.random() * validDirections.length)];
  const newPos = getAdjacentPosition(goblin.position, newDirection);
  
  return {
    ...goblin,
    position: newPos,
    direction: newDirection,
  };
}

/**
 * Check if a goblin is moving towards the player
 * Returns true if goblin's next position is the player's current position
 */
export function isGoblinApproachingPlayer(
  goblin: Goblin,
  playerPos: Position
): boolean {
  const nextPos = getAdjacentPosition(goblin.position, goblin.direction);
  return nextPos.x === playerPos.x && nextPos.y === playerPos.y;
}

/**
 * Check if a goblin is walking away from the player
 * Returns true if goblin is one space away and its next position moves it further from the player
 */
export function isGoblinWalkingAway(
  goblin: Goblin,
  playerPos: Position
): boolean {
  const distance = getDistance(goblin.position, playerPos);
  if (distance !== 1) {
    return false;
  }
  
  const nextPos = getAdjacentPosition(goblin.position, goblin.direction);
  const currentDistance = getDistance(goblin.position, playerPos);
  const nextDistance = getDistance(nextPos, playerPos);
  
  // Walking away means the next position is further from the player
  return nextDistance > currentDistance;
}

/**
 * Check if a goblin is one block away from player (for backstab)
 */
export function isGoblinAdjacentToPlayer(
  goblin: Goblin,
  playerPos: Position
): boolean {
  const dx = Math.abs(goblin.position.x - playerPos.x);
  const dy = Math.abs(goblin.position.y - playerPos.y);
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
}

/**
 * Calculate Manhattan distance between two positions
 */
export function getDistance(pos1: Position, pos2: Position): number {
  return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
}

/**
 * Initialize a new game state
 */
export function initializeGame(): GameState {
  const { grid, start, end } = generateGrid();
  const trapPositions = generateTraps(grid, start, end, 2);
  const playerPos = { ...start };
  const goblins = generateGoblins(grid, start, end, playerPos);

  return {
    grid,
    playerPosition: playerPos,
    startPosition: start,
    endPosition: end,
    trapPositions,
    goblins,
    status: 'playing',
  };
}

/**
 * Check if player has won (reached the end)
 */
export function checkWin(playerPos: Position, endPos: Position): boolean {
  return playerPos.x === endPos.x && playerPos.y === endPos.y;
}

