package com.university.platform.ctf.converter;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.university.platform.ctf.dto.CTFHint;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.ArrayList;
import java.util.List;

@Converter
public class CTFHintListConverter implements AttributeConverter<List<CTFHint>, String> {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public String convertToDatabaseColumn(List<CTFHint> hints) {
        if (hints == null || hints.isEmpty()) return "[]";
        try {
            return MAPPER.writeValueAsString(hints);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    @Override
    public List<CTFHint> convertToEntityAttribute(String json) {
        if (json == null || json.isBlank()) return new ArrayList<>();
        try {
            return MAPPER.readValue(json, new TypeReference<List<CTFHint>>() {});
        } catch (JsonProcessingException e) {
            return new ArrayList<>();
        }
    }
}
