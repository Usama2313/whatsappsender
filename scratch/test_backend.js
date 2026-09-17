const { handleTeacherAgentQuery } = require('../server/agent/quranTeacherAgent');
const HADITH_DATABASE = require('../server/data/hadithData');
const TAJWEED_RULES = require('../server/data/tajweedData');

async function testBackend() {
  console.log("=== 1. Testing Hadith Database ===");
  console.log(`Loaded ${HADITH_DATABASE.length} authentic Hadiths.`);
  console.log("Sample Hadith 1:", HADITH_DATABASE[0].book, "#" + HADITH_DATABASE[0].hadithNumber);

  console.log("\n=== 2. Testing Tajweed Rules ===");
  console.log(`Loaded ${TAJWEED_RULES.length} Tajweed modules.`);
  console.log("Sample Rule:", TAJWEED_RULES[0].title);

  console.log("\n=== 3. Testing Ustadha Maryam AI Agent ===");
  const test1 = await handleTeacherAgentQuery("What does Sahih Bukhari say about seeking knowledge?");
  console.log("Teacher Answer for Knowledge Query:\n", test1.text.slice(0, 300) + "...\n");

  const test2 = await handleTeacherAgentQuery("Teach me Tajweed rule for Qalqalah");
  console.log("Teacher Answer for Tajweed Query:\n", test2.text.slice(0, 300) + "...\n");

  console.log("SUCCESS: All backend modules functional!");
}

testBackend();
