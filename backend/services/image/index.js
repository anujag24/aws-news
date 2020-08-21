/**
 * Image Service
 * 
 * 
 * 
 */


const AWSXRay = require('aws-xray-sdk-core')
const DDB = require("aws-sdk/clients/dynamodb");
const S3 = require("aws-sdk/clients/s3");
const sharp = require("sharp");

const DEFAULT_IMAGE_WIDTH = process.env.DEFAULT_IMAGE_WIDTH;

let ddbclient = null;
let s3client = null;

/**
 * Resizes the image to the desired width, using SharpJS (cover mode to
 * fill dimensions). Also converts to JPEG format.
 * @param {*} buffer 
 * @param {*} width 
 */
async function processImage(buffer, width) {
  return await sharp(buffer)
                  .resize({ width })
                  .toBuffer();
}

/**
 * Stores the image in the S3 bucket.
 * @param {*} image 
 * @param {*} name 
 */
async function storeImage(image, name, metadata) {
  return s3client.putObject({
    Bucket: process.env.CONTENT_BUCKET,
    Key: name,
    Body: image,
    ContentType: 'image/jpeg',
    Metadata: metadata
  }).promise();
}

/**
 * Processes and then stores in the image.
 * @param {*} buffer 
 * @param {*} articleId 
 * @param {*} size 
 * @param {*} width 
 */
async function resizeAndStoreImage(imageBaseKey, newImageKey, articleId, desiredWidth=DEFAULT_IMAGE_WIDTH) {
  const buffer = await getImage(imageBaseKey).Body;

  const image = await processImage(buffer, desiredWidth);
  await storeImage(image, newImageKey, { articleId, imageBaseKey });

  return Promise.resolve(image);
}

/**
 * Get the object from the content bucket.
 * @param {*} imageKey 
 */
async function getImage(imageKey) {
  return s3client.getObject({
    Bucket: process.env.CONTENT_BUCKET,
    Key: imageKey
  }).promise();
}

/**
 * Load Article metadata from DynamoDB
 * @param {*} articleId 
 */
async function getArticleMetadata(articleId) {
  if (!ddbclient) {
    // @see https://twitter.com/m4nl5r/status/1293207153306632195?s=11
    ddbclient = new DDB.DocumentClient();
    AWSXRay.captureAWSClient(ddbclient.service);
  }

  return ddbclient.get({
    TableName: process.env.ARTICLES_TABLE,
    Key: { id: articleId },
    AttributesToGet: [
      'image'
    ]
  }).promise();
}

/**
 * 
 * Main handler function.

 */
exports.handler = async(event) => {
  // console.log(JSON.stringify(event));

  const { pathParameters: { id: articleId }, queryStringParameters: { size } } = event;
  console.log(`Loading image for article ${articleId}, @ ${size} px`);

  // query DDB for the base image key (no size included, this is the default image size)
  let imageBaseKey = await getArticleMetadata(articleId);
  let imageKey = imageBaseKey.replace(/\.jpg$/, `-${size}.jpg`);

  if (!s3client) { s3client = AWSXRay.captureAWSClient(new S3()); }

  // check if the sized image exists in S3; if not, handle error by creating a new image and storing
  let buffer;
  try {
    buffer = await getImage(imageKey).Body;
  } catch (e) {
    if (e instanceof NoSuchKeyError) {
      console.error('NO SUCH KEY')
      buffer = resizeAndStoreImage(imageBaseKey, imageKey, articleId, size);
    } else {
      console.error(e);
      return {
        isBase64Encoded: false,
        statusCode: 404,
        body: { error: 'Not Found' }
      }
    }
  }

  return {
    isBase64Encoded: true,
    statusCode: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': process.env.CACHE_CONTROL_VALUE
    },
    body: buffer.toString('base64')
  }
}