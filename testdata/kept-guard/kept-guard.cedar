// No warning: the guards are always true, but the accesses after them need them.
permit(
    principal,
    action == Action::"get",
    resource
) when {
    principal has nick && principal.nick == "al" &&
    principal.hasTag("t") && principal.getTag("t") > resource.int
};

// One warning, on `principal has nick`: always true, and nothing relies on it.
permit(
    principal,
    action == Action::"get",
    resource
) when {
    principal has nick && principal.active
};
