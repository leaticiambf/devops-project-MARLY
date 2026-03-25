package org.marly.mavigo.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

class FrontendControllerTest {

    @Test
    void redirectToFrontend_preservesPathAndQueryString() {
        FrontendController controller = new FrontendController();
        ReflectionTestUtils.setField(controller, "frontendBaseUrl", "http://localhost:3000");

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/tasks");
        request.setQueryString("next=%2Ftasks");

        assertEquals("redirect:http://localhost:3000/tasks?next=%2Ftasks", controller.redirectToFrontend(request));
    }

    @Test
    void redirectToFrontend_handlesRootPathWithoutDuplicatingSlash() {
        FrontendController controller = new FrontendController();
        ReflectionTestUtils.setField(controller, "frontendBaseUrl", "http://localhost:3000/");

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/");

        assertEquals("redirect:http://localhost:3000/", controller.redirectToFrontend(request));
    }
}
