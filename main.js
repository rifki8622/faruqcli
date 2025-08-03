const {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason
} = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const inquirer = require('inquirer')
const chalk = require('chalk')
const figlet = require('figlet')
const fs = require('fs-extra')
const path = require('path')

const authDir = './auth_info'
const isFirstTime = !fs.existsSync(path.join(authDir, 'creds.json'))

async function startFaruqCLI() {
    console.clear()
    console.log(chalk.green(figlet.textSync('faruqCLI', { horizontalLayout: 'default' })))

    const { state, saveCreds } = await useMultiFileAuthState(authDir)
    const { version } = await fetchLatestBaileysVersion()

    const socket = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, undefined)
        },
        browser: ['FaruqCLI', 'Chrome', '1.0.0'],
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false
    })

    socket.ev.on('creds.update', saveCreds)

    socket.ev.on('connection.update', async ({ connection, lastDisconnect, pairingCode }) => {
        if (connection === 'open') {
            console.log(chalk.green('\n[✅] Terhubung ke WhatsApp!'))
            await mainMenu(socket)
        }

        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
            if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.red('[⛔] Terlogout. Menghapus sesi...'))
                await fs.remove(authDir)
                process.exit()
            } else {
                console.log(chalk.yellow('[🔁] Reconnecting...'))
                startFaruqCLI()
            }
        }

        if (pairingCode && isFirstTime) {
            console.log(chalk.yellow('\n[📲] Kode Pairing WA:'))
            console.log(chalk.cyanBright(`\n   ${pairingCode}   `))
            console.log(chalk.gray('\nBuka WhatsApp > Perangkat Tertaut > Tautkan Perangkat'))
        }
    })

    socket.ev.on('messages.upsert', ({ messages }) => {
        const msg = messages[0]
        if (!msg.key.fromMe) {
            const sender = msg.pushName || msg.key.remoteJid
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '[Media]'
            console.log(chalk.blue(`\n📩 Pesan Baru dari ${sender}: ${text}`))
        }
    })
}

async function mainMenu(sock) {
    const chats = Object.values(sock.chats || {}).filter(c =>
        c?.id?.endsWith('@s.whatsapp.net') || c?.id?.endsWith('@g.us')
    )

    const choices = chats.map(c => ({
        name: `${c.name || c.id}${c.unreadCount ? ` (${c.unreadCount} belum dibaca)` : ''}`,
        value: c.id
    }))

    const { selectedChat } = await inquirer.prompt([{
        type: 'list',
        name: 'selectedChat',
        message: '📥 Pilih chat:',
        choices
    }])

    const { message } = await inquirer.prompt([{
        type: 'input',
        name: 'message',
        message: 'Ketik pesan:'
    }])

    await sock.sendMessage(selectedChat, { text: message })
    console.log(chalk.green('\n✅ Pesan berhasil dikirim!'))

    setTimeout(() => mainMenu(sock), 1000)
}

startFaruqCLI()
