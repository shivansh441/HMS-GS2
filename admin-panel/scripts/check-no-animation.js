import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminRoot = path.resolve(__dirname, '..');

const BANNED_LIBRARIES = ['gsap', 'framer-motion', 'motion', 'lottie', 'lottie-web', 'animate.css'];

console.log('[check:no-animation] Validating admin panel animation ban...');

// 1. Check package.json dependencies
const pkgPath = path.join(adminRoot, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const allDeps = {
  ...(pkg.dependencies || {}),
  ...(pkg.devDependencies || {}),
};

for (const banned of BANNED_LIBRARIES) {
  if (allDeps[banned]) {
    console.error(`[check:no-animation] FAILED: Banned animation library "${banned}" found in package.json!`);
    process.exit(1);
  }
}

// 2. Recursively check src/ for banned imports
function checkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      checkDir(fullPath);
    } else if (/\.(tsx?|jsx?|css)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      for (const banned of BANNED_LIBRARIES) {
        const importRegex = new RegExp(`from\\s+['"]${banned}(?:/.*)?['"]`, 'i');
        const requireRegex = new RegExp(`require\\(['"]${banned}(?:/.*)?['"]\\)`, 'i');
        if (importRegex.test(content) || requireRegex.test(content)) {
          console.error(`[check:no-animation] FAILED: Banned animation library "${banned}" imported in ${fullPath}!`);
          process.exit(1);
        }
      }
    }
  }
}

const srcDir = path.join(adminRoot, 'src');
if (fs.existsSync(srcDir)) {
  checkDir(srcDir);
}

console.log('[check:no-animation] PASSED: No animation libraries or imports found in admin panel.');
