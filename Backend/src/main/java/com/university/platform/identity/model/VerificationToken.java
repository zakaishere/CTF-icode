package com.university.platform.identity.model;
import com.university.platform.identity.service.AuthService;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(
    name = "verification_tokens",
    indexes = {
        @Index(name = "idx_verification_tokens_user_id",  columnList = "user_id"),
        @Index(name = "idx_verification_tokens_otp_code", columnList = "otp_code")
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VerificationToken {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "uuid")
    private UUID id;

    @Column(name = "otp_code", nullable = false, length = 6)
    private String otpCode;

    @Column(name = "expiry_date", nullable = false)
    private LocalDateTime expiryDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "token_type", nullable = false, length = 20)
    private TokenType tokenType;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(
        name = "user_id",
        nullable = false,
        foreignKey = @ForeignKey(name = "fk_verification_tokens_user")
    )
    private User user;

    public static VerificationToken create(User user, String otpCode, TokenType type) {
        return VerificationToken.builder()
                .user(user)
                .otpCode(otpCode)
                .expiryDate(LocalDateTime.now().plusMinutes(15))
                .tokenType(type)
                .build();
    }

    public boolean isExpired() {
        return LocalDateTime.now().isAfter(this.expiryDate);
    }

    public enum TokenType {
        EMAIL_VERIFICATION,
        PASSWORD_RESET
    }
}
