package com.university.platform.identity.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    private final JavaMailSender mailSender;

    // Public base URL of the frontend, used to build links in emails.
    // Set APP_PLATFORM_URL (e.g. http://161.35.90.34) in .env for production.
    @Value("${app.platform-url:http://localhost:3000}")
    private String platformUrl;

    private static final DateTimeFormatter DT_FMT =
            DateTimeFormatter.ofPattern("EEEE, MMMM d yyyy 'at' HH:mm");

    private static final String PLATFORM_NAME   = "icode-ctf";
    private static final String BRAND_COLOR      = "#6366f1";
    private static final String TEXT_COLOR       = "#e2e8f0";
    private static final String BACKGROUND_COLOR = "#020617";
    private static final String CARD_BG          = "#0f172a";
    private static final String AMBER_COLOR       = "#f59e0b";
    private static final String SUCCESS_COLOR     = "#22c55e";
    private static final String MUTED_COLOR       = "#64748b";

    @Async
    public void sendVerificationEmail(String toEmail, String code) {
        String subject = code + " is your " + PLATFORM_NAME + " verification code";
        String html = String.format("""
            <div style="font-family: 'Inter', sans-serif; background: %s; color: %s; padding: 40px; text-align: center;">
                <div style="background: %s; padding: 30px; border-radius: 12px; display: inline-block; min-width: 300px; border: 1px solid #1e293b;">
                    <h2 style="color: %s; margin-top: 0;">Verify your email</h2>
                    <p style="font-size: 16px;">Welcome to %s! Use the code below to complete your registration:</p>
                    <div style="background: #1e293b; padding: 20px; border-radius: 8px; margin: 25px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: %s;">%s</span>
                    </div>
                    <p style="font-size: 14px; opacity: 0.7;">This code will expire in 15 minutes.</p>
                </div>
            </div>
            """, BACKGROUND_COLOR, TEXT_COLOR, CARD_BG, BRAND_COLOR, PLATFORM_NAME, AMBER_COLOR, code);

        send(toEmail, subject, html);
    }

    @Async
    public void sendPasswordResetEmail(String toEmail, String code) {
        String subject = "Reset your password on " + PLATFORM_NAME;
        String html = String.format("""
            <div style="font-family: 'Inter', sans-serif; background: %s; color: %s; padding: 40px; text-align: center;">
                <div style="background: %s; padding: 30px; border-radius: 12px; display: inline-block; min-width: 300px; border: 1px solid #1e293b;">
                    <h2 style="color: %s; margin-top: 0;">Reset Password</h2>
                    <p style="font-size: 16px;">We received a request to reset your password. Use this code to continue:</p>
                    <div style="background: #1e293b; padding: 20px; border-radius: 8px; margin: 25px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: %s;">%s</span>
                    </div>
                    <p style="font-size: 14px; opacity: 0.7;">If you didn't request this, you can safely ignore this email.</p>
                </div>
            </div>
            """, BACKGROUND_COLOR, TEXT_COLOR, CARD_BG, BRAND_COLOR, AMBER_COLOR, code);

        send(toEmail, subject, html);
    }


    @Async
    public void sendTeacherApprovedEmail(String toEmail, String teacherName) {
        String subject = "Your teacher account is ACTIVE";
        String html = String.format("""
            <div style="font-family: 'Inter', sans-serif; background: %s; color: %s; padding: 40px; text-align: center;">
                <div style="background: %s; padding: 30px; border-radius: 12px; display: inline-block; min-width: 300px; border: 1px solid #1e293b;">
                    <h2 style="color: %s; margin-top: 0;">Welcome Aboard!</h2>
                    <p style="font-size: 16px;">Hello %s,</p>
                    <p style="font-size: 16px; line-height: 1.6;">An administrator has approved your teacher account. You can now log in and start creating assessments.</p>
                    <a href="%s/auth" style="display: inline-block; background: %s; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin-top: 20px; font-weight: bold;">Login now</a>
                </div>
            </div>
            """, BACKGROUND_COLOR, TEXT_COLOR, CARD_BG, SUCCESS_COLOR, teacherName, platformUrl, BRAND_COLOR);

        send(toEmail, subject, html);
    }



    private void send(String to, String subject, String body) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(body, true);
            mailSender.send(message);
        } catch (MessagingException e) {
            log.error("[EMAIL] Failed to send email to {}: {}", to, e.getMessage());
        }
    }
}
