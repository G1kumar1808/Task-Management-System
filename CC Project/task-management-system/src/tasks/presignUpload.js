const AWS = require("aws-sdk");

const s3 = new AWS.S3();

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const filename = qs.filename;
    const contentType = qs.contentType || "application/octet-stream";
    if (!filename)
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "filename required" }),
      };

    const key = `tasks/${Date.now()}_${filename}`;
    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
    };

    const url = await s3.getSignedUrlPromise("putObject", {
      ...params,
      Expires: 60,
    });
    return {
      statusCode: 200,
      body: JSON.stringify({ url, key }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Could not create presigned URL" }),
    };
  }
};
