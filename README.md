# [WIP] Media backup

## What is this?
This is a simple NodeJS server using `fastify` library. The server provides simple REST API that is used by the client application that is accompanying this server.

## Why bother?
NextCloud just didn't work for me. I couldn't be bothered by trying to install Docker, fix missing `sudo`, not working thumbnail generation, my files not being detected, corrupted database, etc.
This should be much-much simpler solution than NextCloud. Still work in progress.

## How does it work?
You put your files into `data` folder located in the same folder with `index.js` file like this
```
data
├── 2020
    ├── 20200101_000000.jpg
    ├── 20200101_000001.jpg
    ├── 20200101_000002.jpg
    ├── 20200101_000003.jpg
    ├── 20200101_000004.jpg
index.js
```
The server then will start enumerating every single folder and file in the `data` folder. It will generate thumbnails for image and video files and store them in `thumb` folder stored in the same folder as `index.js`.

## How to use?
1. Install NodeJS with any npm-compatible package manager.
2. Install dependencies
    - `npm install`
    - `yarn install`
3. Run `node index.js` to start the server

You also can manually trigger regeneration of missing thumbnails and datastore by running `node index.js --regenerate-datastore`.

