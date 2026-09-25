import { WorkerEntrypoint } from "cloudflare:workers";
import { createApp } from "@apiservice/core";
import type { AdjustInventoryInput, GameApi, ListPlayersInput } from "@apiservice/game-contract";
import { D1Game } from "./d1-game";

// Persistent game state (inventory, progression, player metadata). Real-time play
// lives on the external game server, which is the trusted writer (see README.md).

interface Bindings {
  DB: D1Database;
  API_BEARER_TOKEN: string;
}

const app = createApp<Bindings>("game");

app.get("/v1", (c) => c.json({ service: "game", version: 1 }));

export default app;

// RPC surface for other Workers in this account, reached only through a service
// binding (never the public URL): `{ "service": "apiservice-game", "entrypoint": "GameRpc" }`.
export class GameRpc extends WorkerEntrypoint<Bindings> implements GameApi {
  private get game() {
    return new D1Game(this.env.DB);
  }
  stats() {
    return this.game.stats();
  }
  listItems() {
    return this.game.listItems();
  }
  listPlayers(input: ListPlayersInput) {
    return this.game.listPlayers(input);
  }
  getPlayer(id: string) {
    return this.game.getPlayer(id);
  }
  adjustInventory(input: AdjustInventoryInput) {
    return this.game.adjustInventory(input);
  }
}
