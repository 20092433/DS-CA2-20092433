/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";
import {
  GetObjectCommand,
  PutObjectCommandInput,
  GetObjectCommandInput,
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const s3 = new S3Client();

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


        // Validate file type
        const allowedExtensions = [".jpeg", ".png"];
        const fileExtension = srcKey.slice(srcKey.lastIndexOf(".")).toLowerCase();

        if (!allowedExtensions.includes(fileExtension)) {
          console.error(
            `Invalid file type: ${fileExtension}. Supported types are ${allowedExtensions.join(
              ", "
            )}`
          );
          throw new Error(`Unsupported file type: ${fileExtension}`);
        }









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
        }
      }
    }
  }
};