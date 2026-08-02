on run
  set appPath to POSIX path of (path to me)
  set bundleDir to do shell script "/usr/bin/dirname " & quoted form of appPath
  set installer to bundleDir & "/install-bundle.sh"
  try
    do shell script "/bin/zsh " & quoted form of installer
    display dialog "Decimen è stato installato. Puoi usare Send with Decimen dal Finder." buttons {"OK"} default button "OK"
  on error errorMessage number errorNumber
    display dialog "Installazione non riuscita (" & errorNumber & "):" & return & errorMessage buttons {"OK"} default button "OK" with icon stop
  end try
end run
