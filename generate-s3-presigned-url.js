// This is a lambda function that generates a presigned URL for S3 bucket

'use strict';

const AWS = require('aws-sdk');

AWS.config.update({
    accessKeyId: '****', //add the access key of the IAM role with S3 bucket permission
    secretAccessKey: '***', //add the secret key of the IAM role with S3 bucket permission
    region: 'us-east-1',
    signatureVersion: 'v4'
});

const s3 = new AWS.S3();

exports.handler = async function(event) {
    //console.log ("EVENT: \n" + JSON.stringify(event, null, 2));

    let requestObject = JSON.parse(event["body"]);
    //console.log ("requestObject: \n" + JSON.stringify(requestObject, null, 2));

    //const fileType = requestObject.fileType;
    const fileName = requestObject.fileName;
    const myBucket = 'madbuilder-app-storage';

    const get_url = new Promise(function(resolve, reject) {

        s3.getSignedUrl('getObject', {
            "Bucket": myBucket,
            "Expires": 60,
            "Key": fileName
            //"ContentType": fileType //required for putObject method
        }, function(err, url) {
            if (err) {
                reject(Error(err));
            } else {
                resolve(url);
            }
        })
    });

    return get_url;
};
