package com.university.platform.ctf.service;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Slf4j
@Service
public class CTFStorageService {

    @Value("${ctf.upload.path:/tmp/ctf-uploads}")
    private String uploadPath;

    @PostConstruct
    public void init() {
        try {
            Files.createDirectories(Path.of(uploadPath, "zips"));
            Files.createDirectories(Path.of(uploadPath, "extracted"));
            log.info("CTF storage directories ready at {}", uploadPath);
        } catch (IOException e) {
            log.error("Failed to create CTF storage directories: {}", e.getMessage());
        }
    }

    /**
     * Saves the uploaded ZIP to disk, then validates its magic bytes.
     * The file is saved first because reading getInputStream() before transferTo()
     * can exhaust the underlying Part stream, producing a 0-byte file.
     */
    public Path saveZip(MultipartFile file, UUID challengeId) throws IOException {
        String filename = challengeId + "_" + System.currentTimeMillis() + ".zip";
        Path dest = Path.of(uploadPath, "zips", filename);

        // Copy stream directly — avoids the consumed-stream problem with
        // transferTo() when getInputStream() has already been called.
        Files.copy(file.getInputStream(), dest, StandardCopyOption.REPLACE_EXISTING);

        // Validate ZIP magic bytes PK\x03\x04 from the saved file (not the request stream)
        try (InputStream in = Files.newInputStream(dest)) {
            byte[] magicBuf = new byte[4];
            int read = in.read(magicBuf, 0, 4);
            if (read < 4 || magicBuf[0] != 0x50 || magicBuf[1] != 0x4B
                    || magicBuf[2] != 0x03 || magicBuf[3] != 0x04) {
                Files.deleteIfExists(dest);
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "File does not appear to be a valid ZIP archive.");
            }
        }

        log.info("Saved ZIP: {} ({} bytes)", dest, Files.size(dest));
        return dest;
    }

    /**
     * Computes SHA-256 of a file, returned as a lowercase hex string.
     */
    public String sha256(Path file) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = Files.readAllBytes(file);
            byte[] hash = digest.digest(bytes);
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    /**
     * Extracts a ZIP file with mandatory zip-slip prevention.
     * Each entry is normalized and verified to start within the destination directory.
     */
    public Path extractZip(Path zipPath, UUID buildId) throws IOException {
        Path dest = Path.of(uploadPath, "extracted", buildId.toString());
        Files.createDirectories(dest);

        try (ZipInputStream zis = new ZipInputStream(Files.newInputStream(zipPath))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                // Zip-slip prevention: normalize and verify the entry path
                Path entryPath = dest.resolve(entry.getName()).normalize();
                if (!entryPath.startsWith(dest)) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "ZIP entry would escape target directory (zip-slip): " + entry.getName());
                }

                if (entry.isDirectory()) {
                    Files.createDirectories(entryPath);
                } else {
                    // Ensure parent directories exist
                    if (entryPath.getParent() != null) {
                        Files.createDirectories(entryPath.getParent());
                    }
                    Files.copy(zis, entryPath, StandardCopyOption.REPLACE_EXISTING);
                }
                zis.closeEntry();
            }
        }

        log.info("Extracted ZIP {} to {}", zipPath, dest);
        return dest;
    }

    /**
     * Finds the Docker build context within the extracted ZIP.
     * Checks the extraction root first (Dockerfile at root of ZIP).
     * If not found, checks one level deep — handles the common case where users
     * zip a folder (producing myfolder/Dockerfile) instead of the folder's contents.
     * Returns null if no Dockerfile is found anywhere.
     */
    public Path findDockerContext(Path extractedPath) throws IOException {
        if (Files.exists(extractedPath.resolve("Dockerfile"))) {
            return extractedPath;
        }
        try (var entries = Files.list(extractedPath)) {
            return entries
                    .filter(Files::isDirectory)
                    .filter(d -> Files.exists(d.resolve("Dockerfile")))
                    .findFirst()
                    .orElse(null);
        }
    }

    /**
     * Parses the first {@code EXPOSE <port>} instruction in the Dockerfile at
     * the root of {@code dockerContext} and returns the port number.
     *
     * <p>Handles all common forms:
     * <ul>
     *   <li>{@code EXPOSE 8080}</li>
     *   <li>{@code EXPOSE 1337/tcp}</li>
     *   <li>{@code EXPOSE 9000/udp}</li>
     *   <li>Multiple ports on one line: {@code EXPOSE 80 443} — first wins</li>
     * </ul>
     *
     * @param dockerContext the directory that contains the {@code Dockerfile}
     * @return the first exposed port, or {@code null} if the Dockerfile does not
     *         exist or contains no {@code EXPOSE} instruction
     */
    public Integer parseDockerfileExposePort(Path dockerContext) {
        Path dockerfile = dockerContext.resolve("Dockerfile");
        if (!Files.exists(dockerfile)) return null;
        Pattern pat = Pattern.compile("(?i)^\\s*EXPOSE\\s+(\\d{1,5})(?:/(?:tcp|udp))?");
        try {
            for (String line : Files.readAllLines(dockerfile)) {
                Matcher m = pat.matcher(line);
                if (m.find()) {
                    int port = Integer.parseInt(m.group(1));
                    if (port >= 1 && port <= 65535) return port;
                }
            }
        } catch (IOException e) {
            log.warn("Could not read Dockerfile at {}: {}", dockerfile, e.getMessage());
        }
        return null;
    }

    /**
     * Recursively deletes a directory, logging any failure.
     */
    public void cleanup(Path dir) {
        if (dir == null || !Files.exists(dir)) return;
        try {
            Files.walk(dir)
                    .sorted(Comparator.reverseOrder())
                    .forEach(p -> {
                        try {
                            Files.deleteIfExists(p);
                        } catch (IOException e) {
                            log.warn("Could not delete {}: {}", p, e.getMessage());
                        }
                    });
            log.debug("Cleaned up {}", dir);
        } catch (IOException e) {
            log.warn("Cleanup failed for {}: {}", dir, e.getMessage());
        }
    }
}
