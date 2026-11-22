#include <bits/stdc++.h>
 
using namespace std;
 
void solve() {
    int n;
    cin >> n;
    int res = 0;
    long long num = 5;
    while (num <= n) {
        res += n / num;
        num *= 5;
    }
    cout << res;
}
 
signed main() {
    //*
    ios_base::sync_with_stdio(0);
    cin.tie(0);
    //*/
    int t = 1;
    //cin >> t;
    for (int t1 = 0; t1 < t; t1 ++) {
        solve();
    }
    return 0;
}