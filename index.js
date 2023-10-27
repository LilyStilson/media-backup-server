const 
    fs = require('fs'),
    path = require('path'),
    sharp = require('sharp'),
    thumbsupply = require('thumbsupply'),
    mime = require("mime"),
    chalk = require('chalk'),
    ffprobe = require('fluent-ffmpeg').ffprobe

const videoFormats = ["mp4", "webm", "mov", "avi", "wmv", "flv", "mkv", "m4v", "m4p", "mpg", "mpeg", "3gp", "3g2"]
const isVideo = (file) => videoFormats.includes(path.extname(file).substring(1))

let data = undefined

async function generateDatastore() {
    async function findOrGenerateThumbnail(filePath, isVideo = false) {
        const thumbDir = path.join(__dirname, "thumb")
        if (!fs.existsSync(thumbDir)) {
            console.warn("Thumb directory not found, creating...")
            fs.mkdirSync(thumbDir)
        }

        // check if thumbnail exists
        // thumbs should have same directory structure as the bast file
        // and have the same name, but with `.thumb.jpeg` extension
        // also we should replace "./data" within path with "./thumb"
        const thumbPath = path.join(thumbDir, filePath.replace(__dirname + "/data/", "") + ".thumb.jpeg")

        if (fs.existsSync(thumbPath)) {
            return thumbPath.replace(__dirname + "/", "")
        } else {
            // generate thumbnail using Sharp
            try {
                if (!fs.existsSync(path.dirname(thumbPath))) 
                    fs.mkdirSync(path.dirname(thumbPath), { recursive: true })
                if (!isVideo) {
                    await sharp(filePath)
                        .resize(200, 200)
                        .toFile(thumbPath)
                    console.log(chalk.green("Generated thumb for " + filePath))
                } else {
                    let thumb = await thumbsupply.generateThumbnail(filePath)
                    await sharp(thumb)
                        .resize(200, 200)
                        .toFile(thumbPath)
                    console.log(chalk.blue("Generated thumb for " + filePath))
                }
            } catch (err) {
                console.error(chalk.red("Failed to generate thumb for " + filePath))
                return null
            }

            return thumbPath.replace(__dirname + "/", "")
        }

    }

    async function getAspectRatio(filePath) {
        try {
            if (isVideo(filePath)) {
                return new Promise((resolve, reject) => {
                    try {
                        ffprobe(filePath, (err, metadata) => {
                            if (err) {
                                resolve(null)
                            }
                            else resolve(metadata.streams[0].width / metadata.streams[0].height)
                        })
                    } catch (err) {
                        resolve(null)
                    }
                })
            } else {
                let metadata = await sharp(filePath).metadata()
                return metadata.width / metadata.height
            }
        } catch (err) {
            return null
        }
    }

    async function processDirectory(dir) {
        let result = []
        const files = fs.readdirSync(dir)

        for (let file of files) {
            if (file === "thumb") continue

            const filePath = path.join(dir, file)
            const fileExtension = path.extname(file) !== "" ? path.extname(file).substring(1) : null
            const stat = fs.statSync(filePath)
            if (stat.isDirectory()) {
                result.push({
                    type: "directory",
                    name: file,
                    path: filePath.replace(__dirname + "/", ""),
                    createdAt: stat.birthtime,
                    modifiedAt: stat.mtime,
                    mimeType: null,
                    extension: fileExtension,
                    children: await processDirectory(filePath)
                })
            } else {
                result.push({
                    type: "file",
                    name: file,
                    path: filePath.replace(__dirname + "/", ""),
                    createdAt: stat.birthtime,
                    modifiedAt: stat.mtime,
                    mimeType: mime.getType(filePath),
                    extension: fileExtension,
                    aspectRatio: await getAspectRatio(filePath),
                    thumb: await findOrGenerateThumbnail(filePath, videoFormats.includes(path.extname(file).substring(1)))
                })
            }
        }

        return result
    }

    return await processDirectory(path.join(__dirname, "data"))
}

// Require the framework and instantiate it
const fastify = require('fastify')({ logger: false })

function sortData(by, order) {
    // first always sort by type to put folders on top
    data.sort((a, b) => a.type === "directory" ? -1 : 1)

    switch(by) {
        case "name":
            if (order === "descending")
                data.sort((a, b) => b.name.localeCompare(a.name))
            else
                data.sort((a, b) => a.name.localeCompare(b.name))
            break
        case "createdAt":
            if (order === "descending")
                data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            else
                data.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            break
        case "modifiedAt":
            if (order === "descending")
                data.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt))
            else
                data.sort((a, b) => new Date(a.modifiedAt) - new Date(b.modifiedAt))
            break
        case "ext": // folders on top, extensions alphabetically
            if (order === "descending")
                data.sort((a, b) => b.extension.localeCompare(a.extension))
            else
                data.sort((a, b) => a.extension.localeCompare(b.extension))
            break
        default:
            break
    }
}

fastify.get('/thumb*', function handler(request, reply) {
    console.log(`${chalk.bgBlue("[GET]")} ${chalk.bgMagenta("[THUMB]")} ${chalk.magenta(`${request.ip} ${request.url}`)}`)
    let filePath = path.join(__dirname, "thumb", request.params["*"])
    let file = fs.readFileSync(filePath)
    reply.header("Content-Type", mime.getType(filePath))
    reply.type(mime.getType(filePath)).send(file)
})

fastify.get('/data*', function handler(request, reply) {
    if(request.query["probe"] === "true") {
        console.log(`${chalk.bgGreen("[PROBE]")} ${chalk.green(`${request.ip} ${request.url}`)}`)
        let filePath = path.join(__dirname, "data", request.params["*"])
        ffprobe(filePath, (err, metadata) => {
            if (err) {
                reply.send({ error: err })
            }
            else reply.send(metadata)
        })
        return
    }

    if (request.params["*"].indexOf(".thumb") != -1)
        console.log(`${chalk.bgBlue("[GET]")} ${chalk.bgMagenta("[THUMB]")} ${chalk.magenta(`${request.ip} ${request.url}`)}`)
    else
        console.log(`${chalk.bgBlue("[GET]")} ${chalk.blue(`${request.ip} ${request.url}`)}`)

    if (request.params["*"] === "") {
        reply.send(data)
        return
    }

    // sortData(data, request.query["sortBy"] || "createdAt", request.query["sortOrder"] || "descending")

    // find the file in the datastore
    let filePath = path.join(__dirname, "data", request.params["*"])
    // let fileExtension = path.extname(filePath).substring(1)

    // serve a file with the given path
    // read file
    let stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
        let dir = data.find((item) => item.path.indexOf(path.basename(filePath)) != -1)

        reply.header("Content-Type", "application/json")
        reply.send(dir)
        return
    }

    let file = fs.readFileSync(filePath)

    if (request.query["web"] === "true" && isVideo(filePath)) {
        let html = "<html><head></head>" 
            + "<body><video controls autoplay loop>"
            +     "<source src=\"" + filePath.replace(__dirname + "/", "http://localhost:3000/") + "\" type=\"" + mime.getType(filePath) +"\">"
            + "</video></body>"
            + "</html>"
        reply.type('text/html').send(html)
        return
    } else {
        reply.header("Content-Type", mime.getType(filePath))
        reply.type(mime.getType(filePath)).send(file)
    }
})

fastify.get("/", function handler(request, reply) {
    console.log(`${chalk.bgBlue("[GET]")} ${chalk.blue(`${request.ip} ${request.url}`)}`)
    reply.send({ isActive: true, device: request.ip })
})

async function generateAndSaveDatastore() {
    console.log(chalk.magenta("Generating datastore..."))
    data = await generateDatastore()
    console.log(chalk.magenta("Datastore generated"))
    fs.writeFileSync(path.join(__dirname, "datastore.json"), JSON.stringify(data))
}

let regenerateDatastore = process.argv.includes("--regenerate-datastore")

// Run the server!
fastify.listen({ port: 3000, host: "0.0.0.0" }, async (err) => {
    console.log(chalk.blue("Server listening on port 3000"))
    if (err) {
        fastify.log.error(err)
        process.exit(1)
    }

    if (!regenerateDatastore && fs.existsSync(path.join(__dirname, "datastore.json"))) {
        data = JSON.parse(fs.readFileSync(path.join(__dirname, "datastore.json")))

        console.log(chalk.magenta("Datastore loaded"))
    } else {
        await generateAndSaveDatastore()
    }
})
