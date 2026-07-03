# codenames
Online Codenames Game

# Run Locally

The ideal host would be an Android user.

## Setup Termux

Download Termux from the Link: https://github.com/termux/termux-app/releases

Paste the following commands in Termux.

```
pkg update && pkg upgrade -y
pkg install nodejs -y
termux-setup-storage
```

## Run the game

Move the downloaded `codenames.js` file into Termux and start it:

```
cp ~/storage/downloads/codenames.js .
termux-wake-lock
node codenames.js
```

You will see the output:

CODENAMES is running.

On THIS device, open: http://localhost:3000

Tell other players (same Wi-Fi) to open:
   http://10.0.x.x:3000
   http://192.168.x.x:3000

Please Ctrl+C to stop the server.
