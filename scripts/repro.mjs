import axios from "axios";

async function run() {
  try {
    // 1. Get batches
    const res = await axios.get("http://localhost:3001/api/v1/dispatch/batches", {
      headers: {
        "x-user-id": "cmsjd2dtw002zkx6ilqb1yuvi", // I don't know my user ID, but I can fetch an auth token if needed. Wait, in development auth might be disabled or mocked.
      }
    });
    console.log(res.data);
  } catch (e) {
    console.error(e.message);
  }
}
run();
