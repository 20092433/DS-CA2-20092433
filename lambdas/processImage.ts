/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

import {
  GetObjectCommand,
  PutObjectCommandInput,
  GetObjectCommandInput,
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const s3 = new S3Client();
const dynamoDB = new DynamoDBClient({ region: 'eu-west-1' });


export const handler: SQSHandler = async (event) => {
  console.log("Event ", JSON.stringify(event));
  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);        // Parse SQS message
    const snsMessage = JSON.parse(recordBody.Message); // Parse SNS message

    if (snsMessage.Records) {
      console.log("Record body ", JSON.stringify(snsMessage));
      for (const messageRecord of snsMessage.Records) {
        const s3e = messageRecord.s3;
        const srcBucket = s3e.bucket.name;
        // Object key may have spaces or unicode non-ASCII characters.
        const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));


        // validate file types
        if (!srcKey.toLowerCase().endsWith('.jpeg') && !srcKey.toLowerCase().endsWith('.png')) {
          console.error(`Invalid file type: ${srcKey}`);
          throw new Error(`Invalid file type: ${srcKey}`);
        }

        // **Step 2: Log valid image to DynamoDB**
      const logParams = {
        TableName: process.env.DYNAMODB_TABLE_NAME!,
        Item: {
          fileName: { S: srcKey },
        },
      };
      await dynamoDB.send(new PutItemCommand(logParams));
      console.log(`Logged file to DynamoDB: ${srcKey}`);


       
        let origimage = null;
        try {
          // Download the image from the S3 source bucket.
          const params: GetObjectCommandInput = {
            Bucket: srcBucket,
            Key: srcKey,
          };
          origimage = await s3.send(new GetObjectCommand(params));
          // Process the image ......
        } catch (error) {
          console.log(error);
          throw error; // to the dead queue
        }
      }
    }
  }
};