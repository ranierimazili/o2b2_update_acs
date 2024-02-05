process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { crlDownloadAddresses } from "./crlDownloadList.js";
import fs from 'fs';
import { X509CRL } from 'jsrsasign';

//Todo certificado de aplicação de produção (brcac) é emitido por uma AC subordinada a
//CN=Autoridade Certificadora Raiz Brasileira v10
export const isBrcacCA = function(cert) {
    return cert.issuer.includes("Autoridade Certificadora Raiz Brasileira v10");
}

export const createCerts = async function (certs, environment) {
    const pemCRLs = [];
    const pemCAs = [];
    let shortestCRLDate = null;

    for (const cert of certs) {
        pemCAs.push(cert.toString());

        if (environment === 'production') {
            //download CRL file - only for production
            const cn = cert.subject.split('\n').filter(e => {return e.startsWith("CN=")})[0].substring(3);
            if (crlDownloadAddresses[cn]) {
                const crl = await downloadCRL(crlDownloadAddresses[cn]);
                const pemCrl = `-----BEGIN X509 CRL-----\n${crl.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END X509 CRL-----\n`;
                pemCRLs.push(pemCrl);
                shortestCRLDate = getShortestCRLNextUpdate(shortestCRLDate, pemCrl);
            } else {
                console.warn("WARNING: URL de download do arquivo CRL não encontrado para a AC: ", cert.subject.split('\n').join(','));
            }
        }
    }

    const now = Date();
    if (pemCAs.length > 0) {
        saveFile(pemCAs.join(""), "./certs/cas.pem");
        console.log(`${now} - Arquivo certs/cas.pem com a lista de CAs aceitas pelo ecossistema salvo com sucesso.`);
    }

    if (pemCRLs.length > 0) {
        saveFile(pemCRLs.join(""), "./certs/crls.pem");
        console.log(`${now} - Arquivo certs/crls.pem com a lista de certificados revogados salvo com sucesso.`);
        console.log(`${now} - A CRL com vencimento mais próximo vence em: ${shortestCRLDate}`);
    }
}

const saveFile = function(content, filePath) {
    fs.writeFile(filePath, content, (err) => {
        if (err) {
          console.error('Error writing to file:', err);
        }
    });
}

const downloadCRL = async function(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer())
    return buffer;
}

const parseCRLDate = function(dateString) {
    const year = parseInt(dateString.substring(0, 2), 10) + 2000; // Assuming it's a year in the 21st century
    const month = parseInt(dateString.substring(2, 4), 10) - 1; // Months are zero-based in JavaScript
    const day = parseInt(dateString.substring(4, 6), 10);
    const hours = parseInt(dateString.substring(6, 8), 10);
    const minutes = parseInt(dateString.substring(8, 10), 10);
    const seconds = parseInt(dateString.substring(10, 12), 10);

    // Create a new Date object
    const dateObject = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    return dateObject;
}

const getNextUpdateFromCRL = function(pemCrl) {
    const x509crl = new X509CRL(pemCrl);
    return parseCRLDate(x509crl.getNextUpdate());
}

const getShortestCRLNextUpdate = function(currentDate, pemCrl) {
    const d = getNextUpdateFromCRL(pemCrl);
    return currentDate == null ? d : d < currentDate ? d : currentDate;
}