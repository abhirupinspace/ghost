const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const API_KEY = process.env.API_KEY || "ghost-secret-key";
const INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 5 * 60 * 1000; // 5 min

async function trigger(endpoint: string) {
  try {
    const res = await fetch(`${SERVER_URL}/trigger/${endpoint}`, {
      method: "POST",
      headers: { "x-api-key": API_KEY },
    });
    const json = await res.json();
    console.log(`[${new Date().toISOString()}] /trigger/${endpoint}:`, JSON.stringify(json));
    return json;
  } catch (e: any) {
    console.error(`[${new Date().toISOString()}] /trigger/${endpoint} error:`, e.message);
  }
}

async function run() {
  console.log(`[runner] polling ${SERVER_URL} every ${INTERVAL_MS / 1000}s`);
  while (true) {
    await trigger("settle");
    await trigger("liquidate");
    await Bun.sleep(INTERVAL_MS);
  }
}

run();
