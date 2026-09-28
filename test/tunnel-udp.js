const test = require('brittle')
const b4a = require('b4a')
const {
  createTestnet,
  startServer,
  startClient,
  udpEchoServer,
  bindUdpClient,
  udpSend,
  udpReceiveOnce
} = require('./helpers.js')

test('tunnels UDP datagrams end-to-end between a Holesail server and client', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await udpEchoServer(t)
  const server = await startServer(t, testnet, { port: echo.address().port, udp: true })
  const client = await startClient(t, testnet, server, { udp: true })

  const local = client.proxy.proxy.address()
  const socket = await bindUdpClient(t)

  await udpSend(socket, local.port, local.address, b4a.from('udp-ping'))
  const reply = await udpReceiveOnce(socket)

  t.is(b4a.toString(reply), 'udp-ping')
})

test('carries several distinct UDP datagrams from the same local client', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await udpEchoServer(t)
  const server = await startServer(t, testnet, { port: echo.address().port, udp: true })
  const client = await startClient(t, testnet, server, { udp: true })

  const local = client.proxy.proxy.address()
  const socket = await bindUdpClient(t)

  const messages = ['one', 'two', 'three']
  const received = []
  const done = new Promise((resolve) => {
    socket.on('message', (msg) => {
      received.push(b4a.toString(msg))
      if (received.length === messages.length) resolve()
    })
  })

  for (const msg of messages) {
    await udpSend(socket, local.port, local.address, b4a.from(msg))
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  await done

  t.alike(received.sort(), messages.sort())
})

test('client picks up udp from the server probe', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await udpEchoServer(t)
  const server = await startServer(t, testnet, { port: echo.address().port, udp: true })
  const client = await startClient(t, testnet, server, { udp: undefined })

  t.is(client.info.udp, true)
})
