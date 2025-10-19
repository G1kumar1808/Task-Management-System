const AWS = require("aws-sdk");

const s3 = new AWS.S3();

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const key = qs.key;
    if (!key)
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "key required" }),
      };

    const url = await s3.getSignedUrlPromise("getObject", {
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Expires: 60,
    });
    return { statusCode: 200, body: JSON.stringify({ url }) };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Could not create presigned download URL",
      }),
    };
  }
};
