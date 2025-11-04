import nodemailer from "nodemailer";
import to from "await-to-ts";
import "dotenv/config";
import { logger } from "@shared/logger";

const currentDate = new Date();

const formattedDate = currentDate.toLocaleDateString("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const sendEmail = async (email: string, verificationOTP: string) => {
  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.MAIL_USERNAME,
      pass: process.env.MAIL_PASSWORD,
    },
  });
  const mailOptions = {
    from: `${process.env.MAIL_USERNAME}`,
    to: email,
    date: formattedDate,
    subject: "Verification",
    text: `Your verification code is ${verificationOTP}`,
  };
  const [error, info] = await to(transporter.sendMail(mailOptions));
  if (error) throw error;
  logger.info(`Email sent: ${info.response}`);
};

export default sendEmail;
