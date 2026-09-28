const ReadyResource = require('ready-resource')
const HolesailClient = require('holesail-client')
const HolesailServer = require('holesail-server')
const HyperDHT = require('hyperdht')
const b4a = require('b4a')
const { randomSeed } = require('@holesail/invite')

class Holesail extends ReadyResource {
  constructor(opts = {}) {
    super()
    this.server = opts.server === true
    this.client = !this.server

    this.port = opts.port
    this.host = opts.host
    this.udp = opts.udp

    this.invite = opts.invite || null
    this.seed = opts.seed || null
    this.logger = opts.logger

    this.bootstrap = opts.bootstrap || null

    this.proxy = null
    this.running = false
  }

  async _open() {
    if (this.running) return

    const opts = {
      port: this.port,
      host: this.host,
      udp: this.udp,
      logger: this.logger,
      bootstrap: this.bootstrap === false ? false : this.bootstrap || HyperDHT.BOOTSTRAP
    }

    if (this.server) opts.seed = this.seed
    if (this.client) opts.invite = this.invite

    this.proxy = this.server ? new HolesailServer(opts) : new HolesailClient(opts)

    this._emit()
    await this.proxy.ready()
    this.running = true
  }

  _emit() {
    this.proxy.on('listening', () => this.emit('listening'))

    if (this.server) {
      this.proxy.on('connection', () => this.emit('connection'))
    } else {
      this.proxy.on('connect', () => this.emit('connect'))
    }
  }

  async pause() {
    await this.proxy.pause()
  }

  async resume() {
    await this.proxy.resume()
  }

  static async probe(invite, dht = null) {
    return await HolesailClient.probe(invite, dht)
  }

  static randomSeed() {
    return randomSeed()
  }

  get info() {
    const proxyInfo = this.proxy.info
    const info = {
      server: this.server,
      client: this.client,
      state: proxyInfo.state,
      port: proxyInfo.port,
      host: proxyInfo.host,
      udp: proxyInfo.udp,
      invite: proxyInfo.invite
    }

    if (this.server) info.seed = b4a.toString(proxyInfo.seed, 'hex')
    return info
  }

  async _close() {
    this.running = false
    await this.proxy.close()
  }
}

// eslint-disable-next-line no-unused-vars
function noop() {}

module.exports = Holesail
