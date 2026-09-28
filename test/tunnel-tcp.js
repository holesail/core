const test = require('brittle')
const b4a = require('b4a')
const {
  createTestnet,
  startServer,
  startClient,
  tcpEchoServer,
  connectLocal,
  readOnce
} = require('./helpers.js')

test('tunnels TCP data end-to-end between a Holesail server and client', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const server = await startServer(t, testnet, { port: echo.address().port })
  const client = await startClient(t, testnet, server)

  const local = client.proxy.proxy.address()
  const socket = await connectLocal(local.port, local.address)
  t.teardown(() => socket.destroy())

  socket.write('ping-through-tunnel')
  const reply = await readOnce(socket)
  t.is(b4a.toString(reply), 'ping-through-tunnel')
})

test('tunnels several sequential writes without corrupting bytes', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const server = await startServer(t, testnet, { port: echo.address().port })
  const client = await startClient(t, testnet, server)

  const local = client.proxy.proxy.address()
  const socket = await connectLocal(local.port, local.address)
  t.teardown(() => socket.destroy())

  const chunks = ['alpha', 'beta', 'gamma']
  const received = []
  const done = new Promise((resolve) => {
    socket.on('data', (d) => {
      received.push(b4a.toString(d))
      if (received.join('') === chunks.join('')) resolve()
    })
  })

  for (const chunk of chunks) socket.write(chunk)
  await done

  t.is(received.join(''), chunks.join(''))
})

test('binary payloads survive the tunnel intact', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const server = await startServer(t, testnet, { port: echo.address().port })
  const client = await startClient(t, testnet, server)

  const local = client.proxy.proxy.address()
  const socket = await connectLocal(local.port, local.address)
  t.teardown(() => socket.destroy())

  const payload = b4a.from(Array.from({ length: 256 }, (_, i) => i))
  socket.write(payload)
  const reply = await readOnce(socket)
  t.alike(b4a.from(reply), payload)
})

test('each local connection opens its own tunnel', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const server = await startServer(t, testnet, { port: echo.address().port })
  const client = await startClient(t, testnet, server)

  let connections = 0
  server.on('connection', () => connections++)

  const local = client.proxy.proxy.address()

  const socketA = await connectLocal(local.port, local.address)
  t.teardown(() => socketA.destroy())
  socketA.write('a')
  t.is(b4a.toString(await readOnce(socketA)), 'a')

  const socketB = await connectLocal(local.port, local.address)
  t.teardown(() => socketB.destroy())
  socketB.write('b')
  t.is(b4a.toString(await readOnce(socketB)), 'b')

  t.is(connections, 2)
})

test('tunnel still works after pause() and resume()', async (t) => {
  const testnet = await createTestnet(t)
  const echo = await tcpEchoServer(t)
  const server = await startServer(t, testnet, { port: echo.address().port })
  const client = await startClient(t, testnet, server)

  await client.pause()
  await client.resume()

  const local = client.proxy.proxy.address()
  const socket = await connectLocal(local.port, local.address)
  t.teardown(() => socket.destroy())

  socket.write('after-resume')
  const reply = await readOnce(socket)
  t.is(b4a.toString(reply), 'after-resume')
})
