import { SQSHandler } from 'aws-lambda';
import { SESClient, SendEmailCommand, SendEmailCommandInput } from '@aws-sdk/client-ses';
import { SES_EMAIL_TO, SES_EMAIL_FROM, SES_REGION } from '../env'; // Ensure env variables are defined

if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
  throw new Error(
    'Please add the SES_EMAIL_TO, SES_EMAIL_FROM, and SES_REGION environment variables in an env.js file located in the root directory'
  );
}

// Initialize the SES Client
const sesClient = new SESClient({ region: SES_REGION });

// Define handler
export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body); // Parse the SQS message
      const rejectionDetails = JSON.parse(body.Message); // Parse the embedded SNS message

      const fileName = rejectionDetails.fileName || 'Unknown File';
      const errorMessage = rejectionDetails.errorMessage || 'Unknown Error';

      console.log(`Processing rejection for file: ${fileName}`);

      // Prepare email details
      const emailParams: SendEmailCommandInput = {
        Source: SES_EMAIL_FROM,
        Destination: { ToAddresses: [SES_EMAIL_TO] },
        Message: {
          Subject: { Data: 'File Upload Rejected' },
          Body: {
            Text: {
              Data: `Your file upload has been rejected.\n\nFile Name: ${fileName}\nReason: ${errorMessage}`,
            },
            Html: {
              Data: getHtmlContent(fileName, errorMessage),
            },
          },
        },
      };

      // Send email
      await sesClient.send(new SendEmailCommand(emailParams));
      console.log(`Sent rejection email for file: ${fileName}`);
    } catch (error) {
      console.error('Failed to process message or send email:', error);
    }
  }
};

// Function to generate HTML content for rejection email
function getHtmlContent(fileName: string, errorMessage: string): string {
  return `
    <html>
      <body>
        <h2>Your File Upload Has Been Rejected</h2>
        <ul>
          <li><strong>File Name:</strong> ${fileName}</li>
          <li><strong>Reason:</strong> ${errorMessage}</li>
        </ul>
        <p>Please ensure the file meets the requirements and try again.</p>
      </body>
    </html>
  `;
}
