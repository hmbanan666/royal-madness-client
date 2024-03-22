import { createId } from "@paralleldrive/cuid2";
import { db } from "./db.client.ts";
import { getRandomInRange } from "./lib/helpers.ts";

export function createPlayer(dto: { twitchId: string; userName: string }) {
  const colorIndex = getRandomInRange(0, 100);
  return db.player.create({
    data: {
      id: createId(),
      twitchId: dto.twitchId,
      userName: dto.userName,
      x: -100,
      y: 600,
      colorIndex,
    },
  });
}

export function updatePlayer(dto: { twitchId: string; x: number; y: number }) {
  return db.player.updateMany({
    where: { twitchId: dto.twitchId },
    data: {
      x: dto.x,
      y: dto.y,
    },
  });
}

export async function findOrCreatePlayer({
  twitchId,
  userName,
}: { twitchId: string; userName: string }) {
  const player = await db.player.findFirst({
    where: { twitchId },
  });
  if (!player) {
    // Create new one!
    return createPlayer({ twitchId, userName });
  }

  // Already in DB
  return player;
}

export function findActivePlayers() {
  // Active = 20 minutes?
  //const time = new Date();
  //const milliseconds = 20 * 60 * 1000;
  //const lastActionAt = new Date(time.getTime() - milliseconds);

  return db.player.findMany();
}

export function findTopByReputationPlayers() {
  return db.player.findMany({
    where: { reputation: { gt: 0 } },
    orderBy: { reputation: "desc" },
    take: 10,
  });
}

export function createCommand(dto: {
  playerId: string;
  command: string;
  target?: string;
}) {
  return db.command.create({
    data: {
      id: createId(),
      playerId: dto.playerId,
      command: dto.command,
      target: dto.target,
    },
  });
}

export function findCommands() {
  return db.command.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      player: true,
    },
  });
}

export function findTree(id: string) {
  return db.tree.findUnique({ where: { id } });
}

export function findTrees() {
  return db.tree.findMany();
}

export function findTreeToChop() {
  return db.tree.findFirst({
    where: {
      size: { gte: 50 },
      inProgress: false,
      isReserved: false,
    },
    orderBy: {
      progressFinishAt: "asc",
    },
  });
}

export function reserveTree(id: string) {
  return db.tree.update({
    where: { id },
    data: {
      isReserved: true,
    },
  });
}

export function updateTree(dto: { id: string; size: number }) {
  return db.tree.update({
    where: { id: dto.id },
    data: {
      size: dto.size,
    },
  });
}

export async function growTrees() {
  const treesCanGrow = await db.tree.findMany({
    where: { size: { lt: 100 } },
  });

  for (const tree of treesCanGrow) {
    // Random to resource
    let resource = 0;
    const rand = Math.random();
    if (rand < 0.03) {
      // 3% chance to +1 resource
      resource = 1;
    }

    // +1 to size
    await db.tree.update({
      where: { id: tree.id },
      data: {
        size: {
          increment: 1,
        },
        resource: {
          increment: resource,
        },
      },
    });
  }
}

export async function setTreeInProgress(id: string) {
  const tree = await db.tree.findUnique({
    where: { id },
  });
  if (!tree) {
    return null;
  }

  // 30 seconds to chop?
  const time = new Date();
  const milliseconds = 30 * 1000;
  const progressFinishAt = new Date(time.getTime() + milliseconds);

  return db.tree.update({
    where: { id },
    data: {
      progressFinishAt,
      inProgress: true,
    },
  });
}

export function setPlayerMadeAction(playerId: string) {
  return db.player.update({
    where: { id: playerId },
    data: {
      lastActionAt: new Date(),
    },
  });
}

export function clearPlayerTarget(playerId: string) {
  return db.player.update({
    where: { id: playerId },
    data: {
      targetX: null,
      targetY: null,
      targetId: null,
    },
  });
}

export async function setPlayerMovingToTarget(dto: {
  id: string;
  targetId: string;
  x: number;
  y: number;
}) {
  await setPlayerMadeAction(dto.id);

  return db.player.update({
    where: { id: dto.id },
    data: {
      targetX: dto.x,
      targetY: dto.y,
      targetId: dto.targetId,
      isBusy: true, // running?
      lastActionAt: new Date(),
    },
  });
}

export async function setPlayerIsOnTarget(playerId: string) {
  const player = await db.player.findUnique({
    where: { id: playerId },
  });
  if (!player || !player.targetId || !player.targetX || !player.targetY) {
    return null;
  }

  // If target is outScreen
  if (player.targetId === "0") {
    await setPlayerCoordinates(player.id, player.targetX, player.targetY);
    await clearPlayerTarget(player.id);
    await setPlayerNotBusy(player.id);
    return;
  }

  // Find target
  const tree = await findTree(player.targetId);
  if (!tree) {
    return null;
  }

  // After - will chop
  await setPlayerCoordinates(player.id, tree.x, tree.y);
  await setPlayerChopping(player.id);

  // Working time
  await setTreeInProgress(tree.id);

  await createCommand({
    playerId: player.id,
    command: "!рубить",
    target: tree.id,
  });
}

export function setPlayerCoordinates(id: string, x: number, y: number) {
  return db.player.update({
    where: { id },
    data: {
      x,
      y,
    },
  });
}

export async function setPlayerChopping(id: string) {
  await setPlayerMadeAction(id);
  await clearPlayerTarget(id); // now player is on target

  return db.player.update({
    where: { id },
    data: {
      isBusy: true, // chopping?
      lastActionAt: new Date(),
    },
  });
}

async function addWoodToVillage(amount: number) {
  await db.village.updateMany({
    data: {
      wood: {
        increment: amount,
      },
    },
  });

  // Global target
  const village = await findVillage();
  if (village?.globalTargetSuccess && village?.globalTarget) {
    const plusToTarget =
      village.globalTargetSuccess >= village.globalTarget + amount ? amount : 0;

    await db.village.updateMany({
      data: {
        globalTarget: {
          increment: plusToTarget,
        },
      },
    });
  }
}

async function addWoodToPlayerHands(playerId: string, increment: number) {
  const player = await db.player.findUnique({
    where: { id: playerId },
  });

  // Check hands?
  if (!player) {
    return null;
  }

  return db.player.update({
    where: { id: player.id },
    data: {
      handsItemType: "WOOD",
      handsItemAmount: { increment },
    },
  });
}

export async function donateItemsFromPlayerHands(playerId: string) {
  const player = await db.player.findUnique({
    where: { id: playerId },
  });

  // Check hands?
  if (!player) {
    return null;
  }

  if (player.handsItemType === "WOOD") {
    await addWoodToVillage(player.handsItemAmount);
  }

  // + reputation for every resource
  await db.player.update({
    where: { id: playerId },
    data: {
      reputation: {
        increment: player.handsItemAmount,
      },
    },
  });

  await setPlayerMadeAction(playerId);

  // Clear hands
  return db.player.update({
    where: { id: playerId },
    data: {
      handsItemType: null,
      handsItemAmount: 0,
    },
  });
}

export async function sellItemsFromPlayerHands(playerId: string) {
  const player = await db.player.findUnique({
    where: { id: playerId },
  });

  // Check hands?
  if (!player) {
    return null;
  }

  // + coins for every resource
  await db.player.update({
    where: { id: playerId },
    data: {
      coins: {
        increment: player.handsItemAmount,
      },
    },
  });

  await setPlayerMadeAction(playerId);

  // Clear hands
  return db.player.update({
    where: { id: playerId },
    data: {
      handsItemType: null,
      handsItemAmount: 0,
    },
  });
}

function setPlayerNotBusy(playerId: string) {
  return db.player.update({
    where: { id: playerId },
    data: {
      isBusy: false,
    },
  });
}

export async function findInactivePlayers() {
  // Active = 10 minutes?
  const time = new Date();
  const milliseconds = 10 * 60 * 1000;
  const lastActionAt = new Date(time.getTime() - milliseconds);

  const outScreenX = -100;

  const players = await db.player.findMany({
    where: { lastActionAt: { lt: lastActionAt }, x: { not: outScreenX } },
  });
  for (const player of players) {
    await setPlayerMovingToTarget({
      id: player.id,
      targetId: "0",
      x: -100,
      y: 600,
    });
  }
}

export async function findCompletedTrees() {
  const trees = await db.tree.findMany({
    where: {
      inProgress: true,
      progressFinishAt: {
        lte: new Date(),
      },
    },
  });
  for (const tree of trees) {
    console.log(tree.id, `${tree.resource} resource`, "tree completed");

    // await addWoodToVillage(tree.resource);

    // Get command
    const command = await db.command.findFirst({
      where: { target: tree.id },
      orderBy: { createdAt: "desc" },
    });
    if (command) {
      // Wood to hands
      await addWoodToPlayerHands(command.playerId, tree.resource);
      // Player is free now
      await setPlayerNotBusy(command.playerId);
    }

    // Destroy tree
    const newType = getNewTreeType(tree.type);
    await db.tree.update({
      where: { id: tree.id },
      data: {
        isReserved: false,
        inProgress: false,
        resource: 0,
        size: 0,
        type: newType,
      },
    });
  }
}

export function findVillage() {
  return db.village.findFirst();
}

function getNewTreeType(typeNow: string): string {
  const typeAsNumber = Number(typeNow);
  // 1, 2 or 3
  if (typeAsNumber === 3) {
    // Max
    return String(1);
  }
  return String(typeAsNumber + 1);
}
