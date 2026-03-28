const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '../dist/index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const fontCSS = `  <style>
    @font-face {
      font-family: 'Material Design Icons';
      src: url('https://cdn.jsdelivr.net/npm/@expo/vector-icons@14.0.4/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
      font-display: block;
    }
  </style>`;

if (!html.includes('Material Design Icons')) {
  html = html.replace(
    '<link rel="shortcut icon"',
    fontCSS + '\n  <link rel="shortcut icon"'
  );
  fs.writeFileSync(indexPath, html);
  console.log('✓ MaterialCommunityIcons @font-face injected into dist/index.html');
} else {
  console.log('✓ @font-face already present, skipping');
}
