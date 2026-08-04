'use strict';
// Cloudflare R2 espone un'API S3-compatibile, quindi usiamo l'SDK ufficiale AWS.
// Credenziali lette da variabili d'ambiente (vedi README / .env):
//   R2_ACCOUNT_ID
//   R2_ACCESS_KEY_ID
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const fs = require('node:fs');

function getClient() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Credenziali R2 mancanti. Imposta R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (env o file .env).'
    );
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucket() {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error('Variabile R2_BUCKET mancante.');
  return bucket;
}

async function pushFile(localPath, remoteKey) {
  const client = getClient();
  const bucket = getBucket();
  const body = fs.readFileSync(localPath);
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: remoteKey, Body: body }));
  return { bucket, key: remoteKey, size: body.length };
}

async function pullFile(remoteKey, localPath) {
  const client = getClient();
  const bucket = getBucket();
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: remoteKey }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  fs.writeFileSync(localPath, buffer);
  return { bucket, key: remoteKey, size: buffer.length, path: localPath };
}

async function listFiles(prefix = '') {
  const client = getClient();
  const bucket = getBucket();
  const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  return (res.Contents || []).map((o) => ({ key: o.Key, size: o.Size, modified: o.LastModified }));
}

async function deleteFile(remoteKey) {
  const client = getClient();
  const bucket = getBucket();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: remoteKey }));
  return { bucket, key: remoteKey };
}

module.exports = { pushFile, pullFile, listFiles, deleteFile };
