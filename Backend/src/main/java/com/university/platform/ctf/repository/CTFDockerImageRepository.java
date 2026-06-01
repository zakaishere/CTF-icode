package com.university.platform.ctf.repository;

import com.university.platform.ctf.entity.CTFDockerImage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface CTFDockerImageRepository extends JpaRepository<CTFDockerImage, UUID> {

    Optional<CTFDockerImage> findByImageRef(String imageRef);
}
