// İmzalı test çağrısı: node tools/call.mjs <base> <test|prod> <Servis> <İşlem> [gövde.xml]
//   base: http://luca-proxy:8080 (nexa_network içi) | https://simanapp.tech (Caddy üzerinden)
//   Gövde verilmezse HealthCheck zarfı gönderilir. Sır: LUCA_PROXY_SECRET ortam değişkeni.
import { readFileSync } from 'node:fs';
import { sign } from '../app/lib.mjs';

const [base, env, service, op, file] = process.argv.slice(2);
if (!base || !env || !service || !op) {
  console.error('kullanım: call.mjs <base> <test|prod> <Servis> <İşlem> [gövde.xml]');
  process.exit(2);
}
const body = file
  ? readFileSync(file, 'utf8')
  : `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/"><soapenv:Header/><soapenv:Body><tem:${op}/></soapenv:Body></soapenv:Envelope>`;
const path = `/luca/${env}/${service}`;
const action = `http://tempuri.org/I${service}/${op}`;
const ts = Math.floor(Date.now() / 1000);
const res = await fetch(base + path, {
  method: 'POST',
  headers: {
    'Content-Type': 'text/xml; charset=utf-8',
    SOAPAction: action,
    'X-Luca-Ts': String(ts),
    'X-Luca-Sig': sign(process.env.LUCA_PROXY_SECRET ?? '', ts, path, action, body),
  },
  body,
});
console.log(`HTTP ${res.status}`);
console.log((await res.text()).slice(0, 4000));
