// SalmonFruit
// by CatMeowByte

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

const custom_type = "salmonfruit";
const tag_name = "information";
const file_name = "TAIL.md";

// same directory as AGENTS.md. user already know this place. no new location to remember.
const global_dir = resolve(homedir(), ".pi/agent");

async function exists(path: string): Promise<boolean> {
 // access() ask kernel only. readFile() load whole file. waste memory just to check if file there.
 try {
  await access(path);
  return true;
 } catch {
  // file missing or no permission. both mean cant use. treat same.
  return false;
 }
}

async function discover_tail(cwd: string): Promise<string | null> {
 // dirname() need absolute path. "./here" would break walk loop.
 let current = resolve(cwd);

 // dirname("/") is "/". loop forever without this. pi hang.
 const root = "/";

 while (true) {
  const candidate = resolve(current, file_name);

  // closer file more specific to project. stop at first found.
  if (await exists(candidate)) {
   const raw = await readFile(candidate, "utf-8");
   const trimmed = raw.trim();
   // file exist but empty or whitespace only. treat as no file.
   if (trimmed.length > 0) return trimmed;
   return null;
  }

  // walked all the way up. nothing local. fall to global.
  if (current === root) break;

  const parent = dirname(current);

  // nonstandard filesystem where root parent is root. prevent infinite loop.
  if (parent === current) break;

  current = parent;
 }

 // global is last choice. no project context. project tail always win.
 const global_path = resolve(global_dir, file_name);
 if (await exists(global_path)) {
  const raw = await readFile(global_path, "utf-8");
  const trimmed = raw.trim();
  if (trimmed.length > 0) return trimmed;
  return null;
 }

 // no file found anywhere. skip injection. dont add empty message waste tokens.
 return null;
}

// LLM trained on XML/HTML. tagged block easier to parse than raw text. model see <REMINDER> it know this section separate.
function wrap(content: string): string {
 // editor leave empty lines at end by accident. trim them. no wasted tokens on blank space.
 const trimmed = content.trim();

 return `<${tag_name}>\n${trimmed}\n</${tag_name}>`;
}

export default function salmonfruit(pi: ExtensionAPI): void {
 // disk read every turn is slow. tail change rare. read once keep in memory. reload to refresh.
 let tail_content: string | null = null;

 // all session changes fire this event. no need check reason. /reload reread file.
 pi.on("session_start", async (_event, ctx) => {
  tail_content = await discover_tail(ctx.cwd);
 });

 // context is throwaway. before_agent_start stay forever. stale tail pile up over turns. context keep it clean.
 pi.on("context", async (event) => {
  if (!tail_content) return;

  // push at very end. context throwaway so tail once per turn.
  event.messages.push({
   role: "custom",
   customType: custom_type,
   content: wrap(tail_content),
   display: true,
   timestamp: 0,
  });

  return { messages: event.messages };
 });
}
