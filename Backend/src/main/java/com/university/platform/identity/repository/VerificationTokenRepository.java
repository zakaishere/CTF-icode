package com.university.platform.identity.repository;
import com.university.platform.identity.service.AuthService;

import com.university.platform.identity.model.VerificationToken;
import com.university.platform.identity.model.VerificationToken.TokenType;
import com.university.platform.identity.model.VerificationToken.TokenType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface VerificationTokenRepository extends JpaRepository<VerificationToken, UUID> {

    Optional<VerificationToken> findByUser_IdAndTokenType(UUID userId, TokenType tokenType);

    Optional<VerificationToken> findByOtpCodeAndUser_EmailAndTokenType(
            String otpCode, String email, TokenType tokenType);

    @Modifying
    @Query("DELETE FROM VerificationToken vt WHERE vt.user.id = :userId AND vt.tokenType = :type")
    void deleteByUserIdAndTokenType(@Param("userId") UUID userId, @Param("type") TokenType type);
}
