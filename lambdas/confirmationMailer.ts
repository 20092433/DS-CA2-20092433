import { SNSHandler, SQSHandler } from "aws-lambda";
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";
import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-ses";

if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
  throw new Error(
    "Please add the SES_EMAIL_TO, SES_EMAIL_FROM and SES_REGION environment variables in an env.js file located in the root directory"
  );
}

type ContactDetails = {
  name: string;
  email: string;
  message: string;
};

const client = new SESClient({ region: SES_REGION});

export const handler: SNSHandler = async (event: any) => {
  console.log("Event ", JSON.stringify(event));

  for (const record of event.Records) {
    try {
      console.log('Raw SNS Message:', record.Sns.Message);
      const snsMessage = JSON.parse(record.Sns.Message);
      console.log('Parsed SNS Message:', snsMessage);

      if (snsMessage.Records) {
        console.log("Record body ", JSON.stringify(snsMessage.Records));
        for (const messageRecord of snsMessage.Records) {
          const s3 = messageRecord.s3;
          const srcBucket = s3.bucket.name;
          const srcKey = decodeURIComponent(s3.object.key.replace(/\+/g, " "));
          console.log('Source Bucket:', srcBucket);
          console.log('Source Key:', srcKey);

          const name = "The Photo Album";
          const email = process.env.SES_EMAIL_FROM!;
          const message = `We received your Image. Its URL is s3://${srcBucket}/${srcKey}`;

          const params = sendEmailParams({ name, email, message });
          console.log('SES Email Params:', params);

          const response = await client.send(new SendEmailCommand(params));
          console.log('Email sent successfully:', response);
        }
      } else {
        console.warn('No Records found in SNS Message');
      }
    } catch (error: unknown) {
      console.error('Error processing SNS message or sending email:', JSON.stringify(error, null, 2));
    }
  }
};


function sendEmailParams({ name, email, message }: ContactDetails) {
  const parameters: SendEmailCommandInput = {
    Destination: {
      ToAddresses: [SES_EMAIL_TO],
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: getHtmlContent({ name, email, message }),
        },
        // Text: {.           // For demo purposes
        //   Charset: "UTF-8",
        //   Data: getTextContent({ name, email, message }),
        // },
      },
      Subject: {
        Charset: "UTF-8",
        Data: `New image Upload`,
      },
    },
    Source: SES_EMAIL_FROM,
  };
  return parameters;
}

function getHtmlContent({ name, email, message }: ContactDetails) {
  return `
    <html>
      <body>
        <h2>Sent from: </h2>
        <ul>
          <li style="font-size:18px">👤 <b>${name}</b></li>
          <li style="font-size:18px">✉️ <b>${email}</b></li>
        </ul>
        <p style="font-size:18px">${message}</p>
      </body>
    </html> 
  `;
}

