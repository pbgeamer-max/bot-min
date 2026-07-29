require("dotenv").config();
const mineflayer = require("mineflayer");

const {
  BOT_HOST = "localhost",
  BOT_PORT = 25565,
  BOT_VERSION = "1.20.1",
  BOT_USERNAME = "AFK_Bot",
  BOT_PASSWORD,
  RECONNECT_DELAY = 10000,
  AFK_MIN_INTERVAL = 30000,
  AFK_MAX_INTERVAL = 60000,
} = process.env;

let bot = null;
let reconnectTimer = null;
let afkTimer = null;
let isReconnecting = false;

function createBot() {
  const options = {
    host: BOT_HOST,
    port: parseInt(BOT_PORT, 10),
    username: BOT_USERNAME,
    version: BOT_VERSION,
  };

  if (BOT_PASSWORD) {
    options.auth = "microsoft";
    options.password = BOT_PASSWORD;
  }

  console.log(`[${timestamp()}] Connecting to ${BOT_HOST}:${BOT_PORT} as ${BOT_USERNAME}...`);

  bot = mineflayer.createBot(options);

  bot.on("spawn", () => {
    console.log(`[${timestamp()}] Bot spawned successfully.`);
    isReconnecting = false;
    startAfk();
  });

  bot.on("chat", (username, message) => {
    if (username === bot.username) return;
    console.log(`<${username}> ${message}`);
  });

  bot.on("death", () => {
    console.log(`[${timestamp()}] Bot died. Respawning...`);
  });

  bot.on("kicked", (reason) => {
    console.log(`[${timestamp()}] Kicked: ${reason}`);
    scheduleReconnect();
  });

  bot.on("error", (err) => {
    console.error(`[${timestamp()}] Bot error:`, err.message);
  });

  bot.on("end", (reason) => {
    console.log(`[${timestamp()}] Disconnected: ${reason}`);
    stopAfk();
    scheduleReconnect();
  });

  bot.on("login", () => {
    console.log(`[${timestamp()}] Logged in as ${bot.username}`);
  });

  bot.on("playerSpawn", () => {
    console.log(`[${timestamp()}] Player spawned.`);
  });

  bot.on("health", () => {
    if (bot.health <= 0) {
      console.log(`[${timestamp()}] Health is 0, waiting for respawn...`);
    }
  });
}

function startAfk() {
  stopAfk();
  const interval = randomInterval(AFK_MIN_INTERVAL, AFK_MAX_INTERVAL);
  console.log(`[${timestamp()}] Anti-AFK started. Next action in ${Math.round(interval / 1000)}s.`);

  afkTimer = setInterval(() => {
    if (!bot || !bot.entity) return;

    const action = Math.floor(Math.random() * 4);

    switch (action) {
      case 0:
        bot.setControlState("jump", true);
        setTimeout(() => bot.setControlState("jump", false), 500);
        console.log(`[${timestamp()}] Anti-AFK: Jump.`);
        break;

      case 1:
        bot.look(bot.entity.yaw + Math.PI / 2, bot.entity.pitch, false);
        console.log(`[${timestamp()}] Anti-AFK: Look around.`);
        break;

      case 2:
        bot.setControlState("forward", true);
        setTimeout(() => {
          bot.setControlState("forward", false);
          bot.setControlState("back", true);
          setTimeout(() => bot.setControlState("back", false), 400);
        }, 400);
        console.log(`[${timestamp()}] Anti-AFK: Walk forward/back.`);
        break;

      case 3:
        bot.swingArm();
        console.log(`[${timestamp()}] Anti-AFK: Swing arm.`);
        break;
    }

    const nextInterval = randomInterval(AFK_MIN_INTERVAL, AFK_MAX_INTERVAL);
    clearInterval(afkTimer);
    afkTimer = setTimeout(() => startAfk(), nextInterval);
  }, interval);
}

function stopAfk() {
  if (afkTimer) {
    clearTimeout(afkTimer);
    clearInterval(afkTimer);
    afkTimer = null;
  }
}

function scheduleReconnect() {
  if (isReconnecting) return;
  isReconnecting = true;
  stopAfk();

  if (bot) {
    bot.removeAllListeners();
    bot = null;
  }

  const delay = parseInt(RECONNECT_DELAY, 10);
  console.log(`[${timestamp()}] Reconnecting in ${delay / 1000}s...`);
  reconnectTimer = setTimeout(() => {
    isReconnecting = false;
    createBot();
  }, delay);
}

function randomInterval(min, max) {
  return Math.floor(Math.random() * (parseInt(max, 10) - parseInt(min, 10) + 1)) + parseInt(min, 10);
}

function timestamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

process.on("uncaughtException", (err) => {
  console.error(`[${timestamp()}] Uncaught Exception:`, err);
});

process.on("unhandledRejection", (reason) => {
  console.error(`[${timestamp()}] Unhandled Rejection:`, reason);
});

process.on("SIGINT", () => {
  console.log(`\n[${timestamp()}] Shutting down...`);
  stopAfk();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (bot) bot.quit("Shutting down");
  process.exit(0);
});

createBot();
