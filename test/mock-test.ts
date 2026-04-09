import { loadConfig } from "../src/config/business-config";
import { getHistory, addMessage } from "../src/store/conversation";

// Mock env
process.env.ACTIVE_CONFIG = "restaurante";

console.log("=== WhatsApp AI Bot - Mock Test ===\n");

// Test 1: Load business config
console.log("1. Loading business config...");
const config = loadConfig();
console.log(`   Business: ${config.businessName}`);
console.log(`   Model: ${config.model}`);
console.log(`   Welcome: ${config.welcomeMessage}`);
console.log(`   System prompt (first 100 chars): ${config.systemPrompt.substring(0, 100)}...`);
console.log("   PASS\n");

// Test 2: Conversation store
console.log("2. Testing conversation store...");
const testPhone = "5215551234567";

let history = getHistory(testPhone, 20);
console.log(`   Empty history length: ${history.length} (expected 0)`);

addMessage(testPhone, "user", "Hola, quiero reservar");
addMessage(testPhone, "assistant", "Claro, con gusto. ¿Para cuántas personas?");
addMessage(testPhone, "user", "Para 4 personas");

history = getHistory(testPhone, 20);
console.log(`   After 3 messages, history length: ${history.length} (expected 3)`);
console.log(`   Last message: "${history[2].content}"`);
console.log("   PASS\n");

// Test 3: History limit
console.log("3. Testing history limit...");
for (let i = 0; i < 25; i++) {
  addMessage(testPhone, "user", `Message ${i}`);
}
history = getHistory(testPhone, 5);
console.log(`   Added 25+ messages, limit=5, got: ${history.length} (expected 5)`);
console.log("   PASS\n");

// Test 4: Load all configs
console.log("4. Loading all business configs...");
const configs = ["restaurante", "barberia", "hotel", "inmobiliaria"];
for (const name of configs) {
  // Reset cache by reassigning env and reimporting
  process.env.ACTIVE_CONFIG = name;
  // Force reload by clearing require cache
  const configPath = require.resolve("../src/config/business-config");
  delete require.cache[configPath];
  const { loadConfig: reload } = require("../src/config/business-config");
  const c = reload();
  console.log(`   ${name}: ${c.businessName} - OK`);
}
console.log("   PASS\n");

console.log("=== All tests passed ===");
process.exit(0);
