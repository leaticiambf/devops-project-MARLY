package org.marly.mavigo.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class FrontendController {

    @Value("${app.frontend.base-url:http://localhost:3000}")
    private String frontendBaseUrl;

    @GetMapping({
            "/",
            "/search",
            "/tasks",
            "/results",
            "/login",
            "/register",
            "/eco-score",
            "/google-link-complete",
            "/google-link-error"
    })
    public String redirectToFrontend(HttpServletRequest request) {
        String redirectUrl = buildRedirectUrl(request);
        return "redirect:" + redirectUrl;
    }

    private String buildRedirectUrl(HttpServletRequest request) {
        StringBuilder redirectUrl = new StringBuilder(frontendBaseUrl);
        String path = request.getRequestURI();

        if (!"/".equals(path)) {
            if (frontendBaseUrl.endsWith("/")) {
                redirectUrl.append(path.substring(1));
            } else {
                redirectUrl.append(path);
            }
        }

        String query = request.getQueryString();
        if (query != null && !query.isBlank()) {
            redirectUrl.append('?').append(query);
        }

        return redirectUrl.toString();
    }
}
