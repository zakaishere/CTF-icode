package com.university.platform.config;

import com.university.platform.identity.model.User;
import com.university.platform.identity.model.User.Role;
import com.university.platform.identity.repository.UserRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;

@Slf4j
@Configuration
@Profile({"dev", "seed"})
@RequiredArgsConstructor
public class CTFAdminSeeder {

    @Bean
    public CommandLineRunner seedAdmin(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        return args -> {
            String adminEmail = "admin@icode-ctf.local";
            if (!userRepository.existsByEmail(adminEmail)) {
                User admin = User.builder()
                        .firstName("icode")
                        .lastName("Admin")
                        .email(adminEmail)
                        .passwordHash(passwordEncoder.encode("Admin1234!"))
                        .role(Role.ADMIN)
                        .isEmailVerified(true)
                        .build();
                userRepository.save(admin);
                log.info("[SEEDER] Admin created — email: {} | password: Admin1234!", adminEmail);
            }
        };
    }
}
