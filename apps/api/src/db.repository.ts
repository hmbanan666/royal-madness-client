import { createId } from "@paralleldrive/cuid2";
import type {
  ItemType,
  PlayerBusinessType,
  SkillType,
  TargetType,
} from "../../../packages/api-sdk/src";
import { getRandomInRange } from "../../../packages/api-sdk/src/lib/random.ts";
import { db } from "./db.client.ts";

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

export function findPlayer(id: string) {
  return db.player.findUnique({
    where: { id },
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

export async function getPlayerCoins(id: string) {
  const player = await db.player.findUnique({
    where: { id },
  });
  return player ? player.coins : null;
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

export async function setTreeInProgress(id: string, seconds: number) {
  const tree = await db.tree.findUnique({
    where: { id },
  });
  if (!tree) {
    return null;
  }

  // Time to chop
  const time = new Date();
  const milliseconds = seconds * 1000;
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
      isBusy: true,
      businessType: "RUNNING",
      lastActionAt: new Date(),
    },
  });
}

export async function setPlayerSkillUp(playerId: string, skill: SkillType) {
  const player = await findPlayer(playerId);
  if (!player) {
    return null;
  }

  if (skill === "WOOD") {
    if (player.skillWood >= player.skillWoodNextLvl) {
      // Max out!
      console.log("skill lvl up!", playerId);

      const skillWoodNextLvl = Math.floor(player.skillWoodNextLvl * 1.5);

      return db.player.update({
        where: { id: playerId },
        data: {
          skillWoodLvl: {
            increment: 1,
          },
          skillWoodNextLvl,
          skillWood: 0,
        },
      });
    }

    const instrument = await getInventoryItem(playerId, "AXE");
    const increment = instrument ? 3 : 1;

    console.log(`+${increment} skill`, playerId);

    return db.player.update({
      where: { id: playerId },
      data: {
        skillWood: { increment },
      },
    });
  }

  if (skill === "MINING") {
    if (player.skillMining >= player.skillMiningNextLvl) {
      console.log("skill lvl up!", playerId);

      const skillMiningNextLvl = Math.floor(player.skillMiningNextLvl * 1.5);

      return db.player.update({
        where: { id: playerId },
        data: {
          skillMiningLvl: { increment: 1 },
          skillMiningNextLvl,
          skillMining: 0,
        },
      });
    }

    const instrument = await getInventoryItem(playerId, "PICKAXE");
    const increment = instrument ? 3 : 1;

    console.log(`+${increment} skill`, playerId);

    return db.player.update({
      where: { id: playerId },
      data: {
        skillMining: { increment },
      },
    });
  }
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

  const targetType = await getTargetType(player.targetId);
  if (!targetType) {
    return null;
  }

  if (targetType === "TREE") {
    const tree = await findTree(player.targetId);
    if (!tree) {
      return null;
    }

    await setPlayerCoordinates(player.id, tree.x, tree.y);
    await setPlayerStartedWorking(player.id, "CHOPPING");

    const axe = await getInventoryItem(playerId, "AXE");
    const workTimeSeconds = axe ? 10 : 30;

    await setTreeInProgress(tree.id, workTimeSeconds);

    return createCommand({
      playerId: player.id,
      command: "!рубить",
      target: tree.id,
    });
  }

  if (targetType === "STONE") {
    const stone = await findStone(player.targetId);
    if (!stone) {
      return null;
    }

    await setPlayerCoordinates(player.id, stone.x, stone.y);
    await setPlayerStartedWorking(player.id, "MINING");

    const pickaxe = await getInventoryItem(playerId, "PICKAXE");
    const workTimeSeconds = pickaxe ? 10 : 30;

    await setStoneInProgress(stone.id, workTimeSeconds);

    return createCommand({
      playerId: player.id,
      command: "!копать",
      target: stone.id,
    });
  }
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

export async function setPlayerStartedWorking(
  id: string,
  businessType: PlayerBusinessType,
) {
  await setPlayerMadeAction(id);
  await clearPlayerTarget(id);

  return db.player.update({
    where: { id },
    data: {
      isBusy: true,
      businessType,
    },
  });
}

export async function getTargetType(id: string): Promise<TargetType | null> {
  const tree = await findTree(id);
  if (tree) {
    return "TREE";
  }

  const stone = await findStone(id);
  if (stone) {
    return "STONE";
  }

  return null;
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

export async function donateWoodFromPlayerInventory(playerId: string) {
  const wood = await getInventoryItem(playerId, "WOOD");
  if (!wood) {
    return null;
  }

  await addWoodToVillage(wood.amount);

  // + reputation for every resource
  await db.player.update({
    where: { id: playerId },
    data: {
      reputation: {
        increment: wood.amount,
      },
    },
  });

  await setPlayerMadeAction(playerId);

  // Destroy item in inventory
  return db.inventoryItem.delete({
    where: { id: wood.id },
  });
}

export async function buyAxeFromDealer(playerId: string) {
  const AXE_PRICE = 20;

  const axe = await getInventoryItem(playerId, "AXE");
  if (axe) {
    return null;
  }

  const coins = await getPlayerCoins(playerId);
  if (!coins || coins < AXE_PRICE) {
    return null;
  }

  await db.player.update({
    where: { id: playerId },
    data: {
      coins: {
        decrement: AXE_PRICE,
      },
    },
  });

  return checkAndAddInventoryItem(playerId, "AXE", 1);
}

export async function sellWoodFromPlayerInventory(playerId: string) {
  const wood = await getInventoryItem(playerId, "WOOD");
  if (!wood) {
    return null;
  }

  // + coins for every resource
  await db.player.update({
    where: { id: playerId },
    data: {
      coins: {
        increment: wood.amount,
      },
    },
  });

  await setPlayerMadeAction(playerId);

  // Destroy item in inventory
  return db.inventoryItem.delete({
    where: { id: wood.id },
  });
}

function setPlayerNotBusy(playerId: string) {
  return db.player.update({
    where: { id: playerId },
    data: {
      isBusy: false,
      businessType: null,
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

    // Get command
    const command = await db.command.findFirst({
      where: { target: tree.id },
      orderBy: { createdAt: "desc" },
    });
    if (command) {
      await checkAndAddInventoryItem(command.playerId, "WOOD", tree.resource);
      // Player is free now
      await setPlayerNotBusy(command.playerId);

      const minusDurability = getRandomInRange(8, 16);
      await checkAndBreakInventoryItem(
        command.playerId,
        "AXE",
        minusDurability,
      );
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

export async function checkAndAddInventoryItem(
  playerId: string,
  type: ItemType,
  amount: number,
) {
  const item = await db.inventoryItem.findFirst({
    where: { playerId, type },
  });
  if (!item) {
    // Create
    return db.inventoryItem.create({
      data: {
        id: createId(),
        playerId,
        amount,
        type,
      },
    });
  }

  // +amount
  return db.inventoryItem.update({
    where: { id: item.id },
    data: {
      amount: {
        increment: amount,
      },
    },
  });
}

export async function getInventoryItem(playerId: string, type: ItemType) {
  const item = await db.inventoryItem.findFirst({
    where: { playerId, type },
  });
  return item ? item : null;
}

export function getInventory(playerId: string) {
  return db.inventoryItem.findMany({
    where: { playerId },
  });
}

export async function checkAndBreakInventoryItem(
  playerId: string,
  type: ItemType,
  durabilityAmount: number,
) {
  const item = await getInventoryItem(playerId, type);
  if (!item) {
    return null;
  }

  console.log(`Reduce item ${item.id} durability by ${durabilityAmount}!`);

  if (item.durability <= durabilityAmount) {
    // Destroy item!
    return db.inventoryItem.delete({
      where: { id: item.id },
    });
  }

  return db.inventoryItem.update({
    where: { id: item.id },
    data: {
      durability: {
        decrement: durabilityAmount,
      },
    },
  });
}

export function findStones() {
  return db.stone.findMany();
}

export function findStone(id: string) {
  return db.stone.findUnique({ where: { id } });
}

export function findStoneToMine() {
  return db.stone.findFirst({
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

export function reserveStone(id: string) {
  return db.stone.update({
    where: { id },
    data: {
      isReserved: true,
    },
  });
}

export async function findCompletedStones() {
  const stones = await db.stone.findMany({
    where: {
      inProgress: true,
      progressFinishAt: {
        lte: new Date(),
      },
    },
  });
  for (const stone of stones) {
    console.log(stone.id, `${stone.resource} resource`, "stone completed");

    // Get command
    const command = await db.command.findFirst({
      where: { target: stone.id },
      orderBy: { createdAt: "desc" },
    });
    if (command) {
      await checkAndAddInventoryItem(command.playerId, "STONE", stone.resource);
      // Player is free now
      await setPlayerNotBusy(command.playerId);

      const minusDurability = getRandomInRange(8, 16);
      await checkAndBreakInventoryItem(
        command.playerId,
        "PICKAXE",
        minusDurability,
      );
    }

    const resource = getRandomInRange(1, 4);

    await db.stone.update({
      where: { id: stone.id },
      data: {
        isReserved: false,
        inProgress: false,
        resource,
      },
    });
  }
}

export async function setStoneInProgress(id: string, seconds: number) {
  const stone = await findStone(id);
  if (!stone) {
    return null;
  }

  const time = new Date();
  const milliseconds = seconds * 1000;
  const progressFinishAt = new Date(time.getTime() + milliseconds);

  return db.stone.update({
    where: { id },
    data: {
      progressFinishAt,
      inProgress: true,
    },
  });
}
