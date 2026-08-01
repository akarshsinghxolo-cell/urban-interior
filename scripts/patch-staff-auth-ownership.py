from pathlib import Path

path = Path("src/components/rdash/StaffEditDialog.tsx")
text = path.read_text()

old_state = '  const [createLogin, setCreateLogin] = React.useState(false);\n'
if text.count(old_state) != 1:
    raise SystemExit("Expected createLogin state exactly once")
text = text.replace(old_state, "")

old_effect = '    setCreateLogin(Boolean(base.login_enabled || base.login_email));\n'
if text.count(old_effect) != 1:
    raise SystemExit("Expected createLogin effect exactly once")
text = text.replace(old_effect, "")

old_payload = '''      login_enabled: createLogin,\n      login_email: createLogin ? (draft.login_email || draft.email)?.trim() : undefined,\n      temporary_password: createLogin ? draft.temporary_password || "ChangeMe_UrbanCastle_2026!" : undefined,\n      force_password_change: createLogin ? draft.force_password_change !== false : false,\n'''
new_payload = '''      // Authentication identity is owned by Supabase Auth + User Approvals.\n      // Never persist password/reset material in the workspace Staff record.\n      login_enabled: staff?.login_enabled,\n      login_email: staff?.login_email || staff?.email,\n      temporary_password: undefined,\n      force_password_change: undefined,\n'''
if text.count(old_payload) != 1:
    raise SystemExit("Expected login payload block exactly once")
text = text.replace(old_payload, new_payload)

old_login_tab = '''            <TabsContent value="login" className="grid gap-3 md:grid-cols-3">\n              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3 md:col-span-3"><div><p className="text-xs font-semibold">Create staff + login access</p><p className="text-[10px] text-muted-foreground">Turn on when the staff member should sign in and receive role-scoped server permissions.</p></div><Switch checked={createLogin} onCheckedChange={setCreateLogin}/></div>\n              <div>{fieldLabel("Login email")}<Input value={draft.login_email || ""} onChange={(e) => patch({ login_email: e.target.value })} disabled={!createLogin} className="h-9"/></div>\n              <div>{fieldLabel("Temporary password")}<Input value={draft.temporary_password || ""} onChange={(e) => patch({ temporary_password: e.target.value })} disabled={!createLogin} placeholder="ChangeMe_UrbanCastle_2026!" className="h-9"/></div>\n              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3"><div><p className="text-xs font-semibold">Force password change</p><p className="text-[10px] text-muted-foreground">Required before live deployment.</p></div><Switch checked={draft.force_password_change !== false} onCheckedChange={(v) => patch({ force_password_change: v })} disabled={!createLogin}/></div>\n            </TabsContent>\n'''
new_login_tab = '''            <TabsContent value="login" className="grid gap-3 md:grid-cols-3">\n              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 md:col-span-3">\n                <div className="flex items-start gap-2">\n                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary"/>\n                  <div>\n                    <p className="text-xs font-semibold">Login access is managed in User Approvals</p>\n                    <p className="mt-1 text-[10px] text-muted-foreground">\n                      {staff?.auth_user_id\n                        ? "This Staff profile is already linked to Supabase Auth. Change authentication access through System Settings → User Approvals; operational profile changes stay here."\n                        : "Save the Staff profile first, then create or approve login access through System Settings → User Approvals. Passwords are never stored in Staff workspace data."}\n                    </p>\n                  </div>\n                </div>\n              </div>\n              {staff?.auth_user_id ? <div>{fieldLabel("Linked login email")}<Input value={staff.login_email || staff.email || ""} disabled className="h-9"/></div> : null}\n            </TabsContent>\n'''
if text.count(old_login_tab) != 1:
    raise SystemExit("Expected login tab block exactly once")
text = text.replace(old_login_tab, new_login_tab)

path.write_text(text)
