const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const url = require("url");

const rooms = new Map();

const W = 900;
const H = 600;
const MAX_PLAYERS = 8;
const ROUND_MS = 30000;
const ROUNDS = 5;

const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css"
};

const uid = () => crypto.randomUUID().slice(0, 8);

function code() {
  let c;
  do {
    c = Math.random().toString(36).slice(2, 6).toUpperCase();
  } while (rooms.has(c));
  return c;
}

function body(req) {
  return new Promise((resolve) => {
    let b = "";

    req.on("data", (d) => {
      b += d;
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(b || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function pub(p) {
  return {
    id: p.id,
    name: p.name,
    x: p.x,
    y: p.y,
    score: p.score,
    color: p.color
  };
}

function state(r) {
  return {
    phase: r.phase,
    round: r.round,
    rounds: ROUNDS,
    timeLeft:
      r.phase === "playing"
        ? Math.max(0, Math.ceil((r.ends - Date.now()) / 1000))
        : 0,
    players: r.players.map(pub),
    coin: r.coin,
    room: r.code,
    version: r.version
  };
}

function spawnCoin(r) {
  r.coin = {
    x: 30 + Math.random() * (W - 60),
    y: 30 + Math.random() * (H - 60),
    value: Math.random() < 0.18 ? 3 : 1
  };
}

function push(r) {
  r.version++;

  r.players.forEach((p) => {
    p.events.push({
      type: "state",
      data: state(r)
    });
  });
}

function start(r) {
  r.phase = "playing";
  r.round++;
  r.ends = Date.now() + ROUND_MS;

  r.players.forEach((p) => {
    p.roundScore = 0;
  });

  spawnCoin(r);
  push(r);
}

function end(r) {
  if (r.phase !== "playing") {
    return;
  }

  r.phase = "results";
  push(r);

  if (r.round >= ROUNDS) {
    r.phase = "finished";
    push(r);
  } else {
    setTimeout(() => {
      if (r.players.length) {
        start(r);
      }
    }, 2500);
  }
}

setInterval(() => {
  rooms.forEach((r) => {
    if (r.phase === "playing" && Date.now() >= r.ends) {
      end(r);
    }
  });
}, 200);

function send(res, obj, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  });

  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const u = url.parse(req.url, true);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type"
    });

    return res.end();
  }

  // Health check
  if (req.method === "GET" && u.pathname === "/health") {
    return send(res, { ok: true });
  }

  // Poll events
  if (req.method === "GET" && u.pathname === "/poll") {
    const roomCode = String(u.query.room || "").toUpperCase();
    const playerId = String(u.query.id || "");

    const r = rooms.get(roomCode);
    const p = r && r.players.find((x) => x.id === playerId);

    if (!p) {
      return send(res, { error: "Not connected" }, 404);
    }

    const events = p.events.splice(0);

    return send(res, { events });
  }

  // Game actions
  if (req.method === "POST" && u.pathname === "/action") {
    const m = await body(req);

    const roomCode = String(m.room || "").toUpperCase();
    const playerId = String(m.id || "");

    const r = rooms.get(roomCode);
    const p = r && r.players.find((x) => x.id === playerId);

    if (!r || !p) {
      return send(res, { error: "Not connected" }, 404);
    }

    if (m.type === "start") {
      if (
        r.players[0].id === p.id &&
        r.players.length >= 2 &&
        r.phase === "lobby"
      ) {
        start(r);
      }
    }

    if (m.type === "move" && r.phase === "playing") {
      const dx = Math.max(
        -1,
        Math.min(1, Number(m.dx) || 0)
      );

      const dy = Math.max(
        -1,
        Math.min(1, Number(m.dy) || 0)
      );

      p.x = Math.max(
        18,
        Math.min(W - 18, p.x + dx * 8)
      );

      p.y = Math.max(
        18,
        Math.min(H - 18, p.y + dy * 8)
      );

      if (
        r.coin &&
        Math.hypot(
          p.x - r.coin.x,
          p.y - r.coin.y
        ) < 28
      ) {
        p.score += r.coin.value;
        spawnCoin(r);
        push(r);
      }
    }

    return send(res, { ok: true });
  }

  // Create / join room
  if (req.method === "POST" && u.pathname === "/join") {
    const m = await body(req);

    let r;

    if (m.type === "create") {
      r = {
        code: code(),
        players: [],
        phase: "lobby",
        round: 0,
        ends: 0,
        coin: null,
        version: 0
      };

      rooms.set(r.code, r);
    } else {
      r = rooms.get(
        String(m.code || "").toUpperCase()
      );
    }

    if (!r) {
      return send(
        res,
        { error: "Room not found" },
        404
      );
    }

    if (r.players.length >= MAX_PLAYERS) {
      return send(
        res,
        { error: "Room is full" },
        400
      );
    }

    if (r.phase !== "lobby") {
      return send(
        res,
        { error: "Game already started" },
        400
      );
    }

    const colors = [
      "#7dd3fc",
      "#fda4af",
      "#86efac",
      "#c4b5fd",
      "#fde68a",
      "#fdba74",
      "#67e8f9",
      "#f9a8d4"
    ];

    const p = {
      id: uid(),
      name: String(m.name || "Player").slice(0, 18),
      x: 100 + Math.random() * 700,
      y: 100 + Math.random() * 400,
      score: 0,
      roundScore: 0,
      color: colors[r.players.length],
      events: []
    };

    r.players.push(p);
    push(r);

    return send(res, {
      id: p.id,
      room: r.code,
      state: state(r)
    });
  }

  // Leave room
  if (req.method === "POST" && u.pathname === "/leave") {
    const m = await body(req);

    const roomCode = String(m.room || "").toUpperCase();
    const r = rooms.get(roomCode);

    if (r) {
      r.players = r.players.filter(
        (p) => p.id !== m.id
      );

      if (!r.players.length) {
        rooms.delete(r.code);
      } else {
        push(r);
      }
    }

    return send(res, { ok: true });
  }

  // Static files
  let filePath;

  if (u.pathname === "/" || u.pathname === "") {
    filePath = path.join(
      __dirname,
      "public",
      "index.html"
    );
  } else {
    filePath = path.join(
      __dirname,
      "public",
      u.pathname
    );
  }

  // Prevent paths from escaping public folder
  const publicDir = path.resolve(
    __dirname,
    "public"
  );

  const resolvedPath = path.resolve(filePath);

  if (!resolvedPath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  if (fs.existsSync(resolvedPath)) {
    const ext = path.extname(resolvedPath);

    res.writeHead(200, {
      "Content-Type":
        mime[ext] ||
        "application/octet-stream"
    });

    return res.end(
      fs.readFileSync(resolvedPath)
    );
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(
  3000,
  "0.0.0.0",
  () => {
    console.log(
      "Coin Clash at http://localhost:3000"
    );
  }
);