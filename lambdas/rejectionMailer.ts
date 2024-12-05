import { SQSHandler } from 'aws-lambda';
import { SESClient, SendEmailCommand, SendEmailCommandInput } from '@aws-sdk/client-ses';
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from '../env';

if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
  throw new Error(
    'Please add the SES_EMAIL_TO, SES_EMAIL_FROM, and SES_REGION environment variables in an env.js file located in the root directory'
  );
}

type RejectionDetails = {
  reason: string;
  file: string;
};

const client = new SESClient({ region: SES_REGION });

export const handler: SQSHandler = async (event) => {
  console.log('Rejection Messages Received:', JSON.stringify(event));

  for (const record of event.Records) {
    try {
      const rejectionMessage: RejectionDetails = JSON.parse(record.body);
      const reason = rejectionMessage.reason || 'Unknown reason';
      const file = rejectionMessage.file || 'Unknown file';

      // Process only "Invalid file type" messages
      if (!reason.includes('Invalid file type')) {
        console.log(`Skipping message for file: ${file}. Reason: ${reason}`);
        continue;
      }

      console.log(`Processing Rejection: Reason - ${reason}, File - ${file}`);

      const params: SendEmailCommandInput = {
        Source: SES_EMAIL_FROM,
        Destination: {
          ToAddresses: [SES_EMAIL_TO],
        },
        Message: {
          Subject: {
            Charset: 'UTF-8',
            Data: 'File Upload Rejected',
          },
          Body: {
            Text: {
              Charset: 'UTF-8',
              Data: `The file "${file}" was rejected. Reason: ${reason}.`,
            },
          },
        },
      };

      await client.send(new SendEmailCommand(params));
      console.log(`Email sent to ${SES_EMAIL_TO} about rejection of file: ${file}`);
    } catch (error) {
      console.error('Error processing rejection message:', error);
    }
  }
};

