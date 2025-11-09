const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

const certDir = path.join(__dirname, '../../resources/app-cert');

// 确保目录存在
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

// 生成根证书
function generateRootCert() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 10);
  
  const attrs = [
    { name: 'countryName', value: 'CN' },
    { name: 'organizationName', value: 'WSS Daemon Manager' },
    { name: 'commonName', value: 'WSS Daemon Root CA' }
  ];
  
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey);
  
  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
  
  fs.writeFileSync(path.join(certDir, 'root.crt'), certPem);
  fs.writeFileSync(path.join(certDir, 'root.key'), keyPem);
  
  console.log('Root certificate generated successfully');
  return { cert, keys };
}

// 生成服务器证书
function generateServerCert(rootCert, rootKeys) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '02';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 10);
  
  const attrs = [
    { name: 'countryName', value: 'CN' },
    { name: 'organizationName', value: 'WSS Daemon Manager' },
    { name: 'commonName', value: 'localhost' }
  ];
  
  cert.setSubject(attrs);
  cert.setIssuer(rootCert.subject.attributes);
  
  // 添加 SAN (Subject Alternative Names)
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: false
    },
    {
      name: 'keyUsage',
      keyCertSign: false,
      digitalSignature: true,
      keyEncipherment: true
    },
    {
      name: 'subjectAltName',
      altNames: [
        {
          type: 2, // DNS
          value: 'localhost'
        },
        {
          type: 7, // IP
          ip: '127.0.0.1'
        }
      ]
    }
  ]);
  
  cert.sign(rootKeys.privateKey);
  
  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
  
  fs.writeFileSync(path.join(certDir, 'server.crt'), certPem);
  fs.writeFileSync(path.join(certDir, 'server.key'), keyPem);
  
  console.log('Server certificate generated successfully');
}

// 主函数
function main() {
  console.log('Generating certificates...');
  const { cert: rootCert, keys: rootKeys } = generateRootCert();
  generateServerCert(rootCert, rootKeys);
  console.log('All certificates generated in:', certDir);
}

main();

