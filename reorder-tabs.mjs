import fs from 'fs';

let content = fs.readFileSync('src/components/video-generation-workspace.tsx', 'utf8');

const step2StartRegex = /\s*\{\/\* --- STEP 2: AI Generate Script ---\ \*\/\}/;
const step2Match = content.match(step2StartRegex);
if (!step2Match) throw new Error("Step 2 not found");
const step2Idx = step2Match.index;

const baStartRegex = /\s*\{\/\* === BEFORE & AFTER MODE === \*\/\}/;
const baMatch = content.match(baStartRegex);
if (!baMatch) throw new Error("Before-After not found");
const baStartIdx = baMatch.index;

const baEndStr = '\n              </Tabs>';
const baEndIdx = content.indexOf(baEndStr, baStartIdx) + baEndStr.length;
const baContent = content.slice(baStartIdx, baEndIdx);

const oldTabsEndStr = '\n                </TabsContent>';
const oldTabsEndIdx = content.lastIndexOf(oldTabsEndStr, baStartIdx);

let newContent = content.slice(0, step2Idx) + 
  '\n                </TabsContent>\n\n' +
  baContent + '\n\n' +
  '              <div className="space-y-5 pt-4">\n' +
  '                <Separator />\n' +
  content.slice(step2Idx, oldTabsEndIdx) + '\n' +
  '              </div>';

newContent += content.slice(baEndIdx);

fs.writeFileSync('src/components/video-generation-workspace.tsx', newContent);
console.log("Reordered successfully");
