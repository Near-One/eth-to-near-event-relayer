import * as http from 'http'
import * as promClient from 'prom-client'
promClient.collectDefaultMetrics({
  register: new promClient.Registry()
})

export class HttpPrometheus {
  port: number
  metricsPrefix: string;
  server: http.Server;

  constructor (port: number, metricsPrefix = 'near_bridge_') {
    this.metricsPrefix = metricsPrefix

    if (port < 1) {
      return;
    }

    this.port = port
    // create a server object:
    this.server = http.createServer(async function (req, res) {
      if (req.url === '/metrics') {
        const metrics = promClient.register.metrics()
        res.write(metrics) // write a response to the client
        res.end() // end the response
        return
      }
      res.write('Not Found')
      res.end()
    })

    this.server.listen(this.port)
  }

  gauge (name: string, help: string, labels = {}): promClient.Gauge<string> {
    const gauge = new promClient.Gauge({
      name: this.metricsPrefix + name,
      help,
      labelNames: Object.keys(labels)
    })
    promClient.register.registerMetric(gauge);
    return gauge;
  }

  counter (name: string, help: string, labels = {}): promClient.Counter<string> {
    const counter = new promClient.Counter({
      name: this.metricsPrefix + name,
      help,
      labelNames: Object.keys(labels)
    })
    promClient.register.registerMetric(counter)
    return counter
  }
}
