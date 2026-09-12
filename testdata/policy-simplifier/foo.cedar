permit(
    principal,
    action,
    resource
) when {
    (principal.username == "foo") || (principal.username == "bar" && principal.username != "bar")
};

permit(
    principal,
    action,
    resource
) when {
    (principal.username == "foo") || (principal.username != "foo" && principal.username == "foo")
};

permit(
    principal,
    action == Action::"get",
    resource
) when {
    resource.int > 11 && resource.int + 1 > 5*2
};

permit(
    principal,
    action == Action::"get",
    resource
) when {
    resource.int > 9223372036854775807
};

permit(
    principal,
    action == Action::"get",
    resource
) when {
    resource.int > 9223372036854775806 + 2
};

permit(
    principal,
    action == Action::"get",
    resource
) when {
    resource has request && resource.request.kind == "read"
};
